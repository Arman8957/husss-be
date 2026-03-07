// src/bootstrap.ts

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

  const config    = app.get(ConfigService);
  const prisma    = app.get(PrismaService);
  const reflector = app.get(Reflector);

  // ── graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async () => {
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);

  // ── resolve host ──────────────────────────────────────────────────────────
  //
  // SOURCE OF TRUTH: RENDER_EXTERNAL_HOSTNAME is injected by Render automatically
  // on every deploy. It will be "husss-be.onrender.com" (no protocol, no slash).
  //
  // Your .env has RENDER_EXTERNAL_HOSTNAME=https://husss-be.onrender.com (wrong).
  // We strip the protocol defensively so either format works.
  //
  // We do NOT use NODE_ENV as the production signal because your .env has
  // NODE_ENV=development and that file gets picked up even on Render.
  //
  const rawRenderHost = (process.env.RENDER_EXTERNAL_HOSTNAME ?? '').trim();

  // Strip accidental protocol prefix (https:// or http://) and trailing slash
  const renderHost = rawRenderHost
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  // isProduction = true when Render injects RENDER_EXTERNAL_HOSTNAME
  // This is independent of NODE_ENV — works even when NODE_ENV=development
  const isProduction = renderHost.length > 0;

  // swaggerServer = scheme + host ONLY, NO /api, NO /v1, NO trailing slash
  //
  // Why bare host only?
  //   NestJS setGlobalPrefix('api') + enableVersioning(URI,'1')
  //   writes every route in the OpenAPI spec as /api/v1/auth/login
  //
  //   Swagger UI computes: swaggerServer + specPath
  //   ✓  https://husss-be.onrender.com  +  /api/v1/auth/login
  //      = https://husss-be.onrender.com/api/v1/auth/login
  //   ✗  https://husss-be.onrender.com/api/v1  +  /api/v1/auth/login
  //      = https://husss-be.onrender.com/api/v1/api/v1/auth/login  ← DOUBLE PREFIX
  //
  const swaggerServer = isProduction
    ? `https://${renderHost}`                          // https://husss-be.onrender.com
    : `http://localhost:${PORT_CANDIDATES[0]}`;        // http://localhost:3000

  Logger.log(`RENDER_EXTERNAL_HOSTNAME = "${rawRenderHost}"`, 'Bootstrap');
  Logger.log(`renderHost               = "${renderHost}"`,    'Bootstrap');
  Logger.log(`isProduction             = ${isProduction}`,    'Bootstrap');
  Logger.log(`swaggerServer            = ${swaggerServer}`,   'Bootstrap');

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
    // Always allow the Render host if we're on Render
    ...(isProduction ? [`https://${renderHost}`] : []),
    ...extraOrigins,
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // No origin = Postman / curl / mobile native — always allow
      if (!origin) return callback(null, true);

      const allowed = allowedOrigins.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin,
      );

      if (allowed) {
        callback(null, true);
      } else {
        Logger.warn(`CORS blocked origin: ${origin}`, 'CORS');
        callback(new Error(`Origin "${origin}" not allowed by CORS`));
      }
    },
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
              connectSrc:  ["'self'", swaggerServer],
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

  // ── global prefix + versioning ────────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── Swagger setup ─────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zenith API')
    .setDescription('Zenith backend REST API')
    .setVersion('1.0')
    .addServer(swaggerServer, isProduction ? 'Production (Render)' : 'Local Development')
    .addTag('auth',  'Authentication & sessions')
    .addTag('tasks', 'User tasks')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'JWT-auth' },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization:   true,
      displayRequestDuration: true,
      tryItOutEnabled:        true,
      filter:                 true,
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
  const docsUrl  = `${swaggerServer}/docs`;

  Logger.log('app is running', 'Bootstrap');
  Logger.log('Zenith API  READY', 'Bootstrap');
  Logger.log(`API:     ${swaggerServer}/api/v1`, 'Bootstrap');
  Logger.log(`Docs:    ${docsUrl}`, 'Bootstrap');
  Logger.log(`Local:   ${localUrl}/api/v1`, 'Bootstrap');
  Logger.log(`Network: http://${getLocalIp()}:${realPort}/api/v1`, 'Bootstrap');
  Logger.log('app is running', 'Bootstrap');

  return { app, httpServer };
}