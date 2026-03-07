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

// ─── helpers ─────────────────────────────────────────────────────────────────

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
  3001,
  3002,
  3007,
  5000,
  8080,
  8000,
];

// ─── bootstrap ───────────────────────────────────────────────────────────────

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const prisma = app.get(PrismaService);
  const reflector = app.get(Reflector); // kept for future guards

  // ── graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async () => {
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ── global prefix + versioning (must come BEFORE Swagger setup) ───────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── environment ───────────────────────────────────────────────────────────
  const isProduction = process.env.NODE_ENV === 'production';

  // On Render, RENDER_EXTERNAL_HOSTNAME = "husss-be.onrender.com" (no protocol, no trailing slash)
  const productionHost = process.env.RENDER_EXTERNAL_HOSTNAME ?? '';
  const baseUrl =
    isProduction && productionHost
      ? `https://${productionHost}`
      : `http://localhost:${PORT_CANDIDATES[0]}`;

  const extraOrigins =
    config
      .get<string>('CORS_ORIGINS', '')
      ?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? [];

  const allowedOrigins = [
    // Local dev
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4200',
    // Mobile
    'capacitor://localhost',
    'ionic://localhost',
    // Expo
    /^exp:\/\/.*/,
    // Production — allow Render-hosted Swagger UI and your app
    ...(isProduction && productionHost ? [`https://${productionHost}`] : []),
    // Extra origins from env
    ...extraOrigins,
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'], // Swagger UI needs these
              styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
              imgSrc: ["'self'", 'data:', 'cdn.jsdelivr.net'],
              connectSrc: ["'self'", baseUrl], // allow Swagger UI → API calls
              fontSrc: ["'self'", 'cdn.jsdelivr.net'],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false, // CSP off in dev — no friction
      crossOriginEmbedderPolicy: false, // required for Swagger UI iframes
    }),
  );

  app.use(compression());
  app.use(cookieParser());

  // ── Swagger docs ──────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zenith API')
    .setDescription('Zenith backend REST API')
    .setVersion('1.0')
    .addServer(
      isProduction && productionHost
        ? `https://${productionHost}`
        : `http://localhost:${PORT_CANDIDATES[0]}`,
      isProduction ? 'Production (Render)' : 'Local Development',
    )
  
    .addServer(
      'http://localhost:3000',
      'Local fallback (no prefix)',
    )
    .addTag('auth', 'Authentication & sessions')
    // ... other tags, bearer auth, etc.
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Mount at /docs — note: NO "api" prefix here because SwaggerModule.setup
  // registers its own routes outside the global prefix
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // keeps JWT across page reloads
      displayRequestDuration: true,
      tryItOutEnabled: true, // "Try it out" enabled by default
      filter: true, // search box in Swagger UI
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

  const address = httpServer.address();
  const realPort =
    typeof address === 'string'
      ? selectedPort
      : (address?.port ?? selectedPort);
  const localUrl = `http://localhost:${realPort}`;
  const networkUrl = `http://${getLocalIp()}:${realPort}`;
  const docsUrl = isProduction ? `${baseUrl}/docs` : `${localUrl}/docs`;

  Logger.log('checking the boostrap', 'Bootstrap');
  Logger.log('Zenith API  READY', 'Bootstrap');
  Logger.log(`Local:      ${localUrl}/api/v1`, 'Bootstrap');
  Logger.log(`Network:    ${networkUrl}/api/v1`, 'Bootstrap');
  Logger.log(`Health:     ${localUrl}/api/v1/health`, 'Bootstrap');
  Logger.log(`Docs:       ${docsUrl}`, 'Bootstrap');
  Logger.log(
    `Env:        ${isProduction ? 'production' : 'development'}`,
    'Bootstrap',
  );
  Logger.log('checking the boostrap', 'Bootstrap');

  return { app, httpServer };
}
