

import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { Server } from 'http';
import { PrismaService } from './prisma/prisma.service';
import { networkInterfaces } from 'os';

function getLocalIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const PORT_CANDIDATES = [
  Number(process.env.PORT) || 3000,
  3001, 3002, 3007, 5000, 8080, 8000,
];

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config  = app.get(ConfigService);
  const prisma  = app.get(PrismaService);
  const reflector = app.get(Reflector);

  // ── graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async () => {
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  // ── global prefix + versioning ────────────────────────────────────────────
  // These make every route /api/v1/...
  // The OpenAPI spec paths will already contain /api/v1/...
  // So addServer() below must be BARE HOST ONLY — no /api/v1 suffix.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── resolve host ──────────────────────────────────────────────────────────
  // Detection order:
  //   1. RENDER_EXTERNAL_HOSTNAME env var (set automatically by Render)
  //   2. NODE_ENV === 'production' fallback to hardcoded Render URL
  //   3. localhost for dev
  const renderHostname =
    process.env.RENDER_EXTERNAL_HOSTNAME ||           // e.g. husss-be.onrender.com
    (process.env.NODE_ENV === 'production'
      ? 'husss-be.onrender.com'                       // hardcoded safety net
      : '');

  const isProduction = !!renderHostname && renderHostname !== '';

  // bareHost = scheme + host ONLY — NO trailing slash, NO /api, NO /v1
  // Correct:   https://husss-be.onrender.com
  // Wrong:     https://husss-be.onrender.com/api/v1   ← causes double prefix
  const bareHost = isProduction
    ? `https://${renderHostname}`
    : `http://localhost:${PORT_CANDIDATES[0]}`;

  Logger.log(`bareHost = ${bareHost}`, 'Bootstrap');
  Logger.log(`isProduction = ${isProduction}`, 'Bootstrap');

  // ── CORS ──────────────────────────────────────────────────────────────────
  const extraOrigins = config
    .get<string>('CORS_ORIGINS', '')
    ?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];

  const allowedOrigins: (string | RegExp)[] = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4200',
    'capacitor://localhost',
    'ionic://localhost',
    /^exp:\/\/.*/,
    ...(isProduction ? [`https://${renderHostname}`] : []),
    ...extraOrigins,
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Postman / mobile / curl
      const allowed = allowedOrigins.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin,
      );
      if (allowed) {
        callback(null, true);
      } else {
        Logger.warn(`CORS blocked: ${origin}`, 'CORS');
        callback(new Error(`Origin "${origin}" not allowed by CORS`));
      }
    },
    credentials: true,
    methods:      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // ── helmet ────────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc:  ["'self'"],
              scriptSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
              styleSrc:    ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
              imgSrc:      ["'self'", 'data:', 'cdn.jsdelivr.net'],
              connectSrc:  ["'self'", bareHost],
              fontSrc:     ["'self'", 'cdn.jsdelivr.net'],
              objectSrc:   ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(compression());
  app.use(cookieParser());

  // ── Swagger ───────────────────────────────────────────────────────────────
  //
  // HOW THIS WORKS:
  //   setGlobalPrefix('api') + enableVersioning(URI, '1')
  //   → every route in the OpenAPI spec has path: /api/v1/auth/login
  //
  //   addServer(bareHost) → Swagger UI builds:
  //   bareHost + path = https://husss-be.onrender.com + /api/v1/auth/login
  //                   = https://husss-be.onrender.com/api/v1/auth/login  ✓
  //
  //   addServer(bareHost + '/api/v1') → Swagger UI builds:
  //   bareHost/api/v1 + /api/v1/auth/login
  //                   = https://husss-be.onrender.com/api/v1/api/v1/auth/login  ✗ DOUBLE
  //
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zenith API')
    .setDescription('Zenith backend REST API')
    .setVersion('1.0')
    // ↓ BARE HOST ONLY — routes already carry /api/v1 from NestJS prefix+versioning
    .addServer(bareHost, isProduction ? 'Production (Render)' : 'Local Development')
    .addTag('auth',    'Authentication & sessions')
    .addTag('tasks',   'User tasks')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'JWT-auth' },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      filter: true,
    },
    customSiteTitle: 'Zenith API Docs',
  });

  // ── global pipes / filters / interceptors ─────────────────────────────────
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ── port binding ──────────────────────────────────────────────────────────
  let httpServer: Server | null = null;
  let selectedPort = PORT_CANDIDATES[0];

  for (const port of PORT_CANDIDATES) {
    try {
      httpServer = await app.listen(port, '0.0.0.0');
      selectedPort = port;
      break;
    } catch (err: any) {
      if (err.code !== 'EADDRINUSE') throw err;
      Logger.warn(`Port ${port} in use, trying next...`, 'Bootstrap');
    }
  }

  if (!httpServer) throw new Error('No available port found!');

  const address  = httpServer.address();
  const realPort = typeof address === 'string' ? selectedPort : (address?.port ?? selectedPort);
  const localUrl = `http://localhost:${realPort}`;
  const docsUrl  = isProduction ? `${bareHost}/docs` : `${localUrl}/docs`;

  Logger.log('──────────────────────────────────────────', 'Bootstrap');
  Logger.log(`Zenith API READY`, 'Bootstrap');
  Logger.log(`Local:   ${localUrl}/api/v1`, 'Bootstrap');
  Logger.log(`Network: http://${getLocalIp()}:${realPort}/api/v1`, 'Bootstrap');
  Logger.log(`Docs:    ${docsUrl}`, 'Bootstrap');
  Logger.log(`Env:     ${isProduction ? 'production → ' + bareHost : 'development'}`, 'Bootstrap');
  Logger.log('──────────────────────────────────────────', 'Bootstrap');

  return { app, httpServer };
}