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
import { ProgramsModule } from './modules/programs/programs.module';
import { BrfModule } from './modules/content-management/brf/brf.module';
import { ExecutionNoteModule } from './modules/content-management/execution-note/execution-note.module';
import { ResearchAndEducationModule } from './modules/content-management/research-and-educaion/research-and-educaion.module';
import { PartnerClinicModule } from './modules/content-management/partner-clinic/partner-clinic.module';
import { EssentialContentModule } from './modules/content-management/essential-content/essential-content.module';
import { CloudinaryModule } from './common/cloudinary/cloudinary.module';
import { SupplimentProductModule } from './modules/content-management/suppliment-product/suppliment-product.module';
import { ProgrammeModule } from './modules/content-management/programme/programme.module';

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
    ProgramsModule,
    BrfModule,
    ExecutionNoteModule,
    ResearchAndEducationModule,
    PartnerClinicModule,
    EssentialContentModule,
    CloudinaryModule,
    SupplimentProductModule,
    ProgrammeModule
  ],
  providers: [

    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
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
export class AppModule { }
