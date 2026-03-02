// src/bootstrap.ts
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';

// Swagger imports
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'; // [citation:1][citation:3]

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
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
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
  const reflector = app.get(Reflector);

  // ────── GRACEFUL SHUTDOWN ──────
  const shutdown = async () => {
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ────── SECURITY & PERFORMANCE ──────
  // Simplified helmet configuration
  app.use(helmet());

  app.use(compression());
  app.use(cookieParser());

  // ────── SWAGGER DOCUMENTATION ──────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Zenith API') // Your API title
    .setDescription('The Zenith API description') // Your API description
    .setVersion('1.0')
    // Add a server entry, using the global prefix and version
    .addServer(
      `http://localhost:${PORT_CANDIDATES[0]}/api/v1`,
      'Local Development Server',
    )
    // You can add more servers for staging/production
    // .addServer('https://staging.zenith.com/api/v1', 'Staging Server')
    // .addServer('https://api.zenith.com/api/v1', 'Production Server')
    .addTag('tasks', 'Operations related to user tasks') // Optional: Organize endpoints with tags
    .addTag('auth', 'User authentication and sessions')
    .addBearerAuth()
    // Add Bearer token authentication if your API uses JWT
    // .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Setup Swagger UI at the '/docs' endpoint
  SwaggerModule.setup('docs', app, document); // [citation:1][citation:3]

  // CORS – mobile + web ready
  // app.enableCors({
  //   origin: [
  //     'http://localhost:3000',
  //     'http://localhost:5173',
  //     'capacitor://localhost',
  //     'ionic://localhost',
  //     'exp://*',
  //     ...(config.get<string>('CORS_ORIGINS')?.split(',') || []),
  //   ],
  //   credentials: true,
  // });
  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'capacitor://localhost',
        'ionic://localhost',
        ...(config
          .get<string>('CORS_ORIGINS')
          ?.split(',')
          .map((o) => o.trim()) || []),
      ];


      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  // Global prefix + versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Global pipes, filters, interceptors
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ────── AUTO PORT BINDING ──────
  let httpServer: Server | null = null;
  let selectedPort: number = PORT_CANDIDATES[0];

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

  const address = httpServer.address();
  const port =
    typeof address === 'string' ? 3000 : address?.port || selectedPort;

  const url = `http://localhost:${port}`;
  const networkUrl = `http://${getLocalIp()}:${port}`;
  const docsUrl = `${url}/docs`; // Swagger UI URL

  Logger.log('Zenith API READY', 'Bootstrap');
  Logger.log(`Local: ${url}/api/v1`, 'Bootstrap');
  Logger.log(`Network: ${networkUrl}/api/v1`, 'Bootstrap');
  Logger.log(`Health: ${url}/api/v1/health`, 'Bootstrap');
  Logger.log(`📚 API Documentation: ${docsUrl}`, 'Bootstrap'); // Updated log for Swagger

  return { app, httpServer };
}
