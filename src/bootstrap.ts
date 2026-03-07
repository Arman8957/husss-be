// src/bootstrap.ts
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';

// Swagger imports
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

// ────── HELPER FUNCTIONS ──────
function getLocalIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip internal (127.0.0.1) and non-IPv4
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
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

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const prisma = app.get(PrismaService);
  const reflector = app.get(Reflector); // unused for now — safe to keep

  // ────── GRACEFUL SHUTDOWN ──────
  const shutdown = async () => {
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ────── SECURITY & PERFORMANCE ──────
  app.enableCors({
    origin: "*",
  });
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  const isProduction = process.env.NODE_ENV === 'production';

  // Base URL = root of the API (without /api or /docs)
  const baseUrl = isProduction
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
    : `http://localhost:${PORT_CANDIDATES[0]}`;

  // ────── SWAGGER DOCUMENTATION ──────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zenith API')
    .setDescription('The Zenith API description')
    .setVersion('1.0')
    .addServer(
      `${baseUrl}/api/v1`,
      isProduction ? 'Production Server' : 'Local Development Server',
    )
    // Optional: explicit local fallback (only shown in dev)
    .addServer(
      `http://localhost:${PORT_CANDIDATES[0]}/api/v1`,
      'Local (dev only)',
    )
    .addTag('tasks', 'Operations related to user tasks')
    .addTag('auth', 'User authentication and sessions')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // ────── CORS ──────
  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'capacitor://localhost',
        'ionic://localhost',
        'exp://*',
        ...(config
          .get<string>('CORS_ORIGINS')
          ?.split(',')
          .map((o) => o.trim()) || []),
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  // ────── GLOBAL PREFIX + VERSIONING ──────
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ────── GLOBAL PIPES, FILTERS, INTERCEPTORS ──────
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ────── AUTO PORT BINDING ──────
  let httpServer: Server | null = null;
  let selectedPort = PORT_CANDIDATES[0];

  for (const port of PORT_CANDIDATES) {
    try {
      httpServer = await app.listen(port, '0.0.0.0');
      selectedPort = port;
      Logger.log(`API running on port ${port}`, 'Bootstrap');
      break;
    } catch (err: any) {
      if (err.code !== 'EADDRINUSE') throw err;
      Logger.warn(`Port ${port} in use, trying next...`, 'Bootstrap');
    }
  }

  if (!httpServer) {
    throw new Error('No available port found!');
  }

  // Get real bound address/port
  const address = httpServer.address();
  const realPort =
    typeof address === 'string' ? selectedPort : (address?.port ?? selectedPort);

  const localUrl = `http://localhost:${realPort}`;
  const networkUrl = `http://${getLocalIp()}:${realPort}`;
  const docsUrl = `${baseUrl}/docs`;

  // ────── FINAL LOGS ──────
  Logger.log('Zenith API READY', 'Bootstrap');
  Logger.log(`Local:      ${localUrl}/api/v1`, 'Bootstrap');
  Logger.log(`Network:    ${networkUrl}/api/v1`, 'Bootstrap');
  Logger.log(`Health:     ${localUrl}/api/v1/health`, 'Bootstrap');
  Logger.log(`📚 Docs:     ${docsUrl}`, 'Bootstrap');

  return { app, httpServer };
}