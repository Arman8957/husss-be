import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { FirebaseModule } from './common/firebase/firebase.module';
import { EmailModule } from './common/email/email.module';
import { AuthModule } from './modules/auth/auth.module';

import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ValidationPipe } from './common/pipes/validation.pipe';
import configuration from './config/configuration';
import { AuditModule } from './common/audit/audit.module';

@Module({
  imports: [
    // Configuration - MUST BE FIRST
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration], // Load your configuration
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    PrismaModule,
    FirebaseModule,
    EmailModule,
    AuthModule,
    AuditModule,
  ],
  providers: [

    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // JWT Auth guard (global - all routes require auth by default)
    // Comment out if you want some public routes
    // {
    //   provide: APP_GUARD,
    //   useClass: JwtAuthGuard,
    // },
    // Global validation pipe
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
    // Global response transformer
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
