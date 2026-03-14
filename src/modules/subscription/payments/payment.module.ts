// src/modules/payments/payment.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentService    } from './payment.service';
import { PaymentController } from './payment.controller';
import { PrismaModule      } from 'src/prisma/prisma.module';

@Module({
  imports:     [PrismaModule, ConfigModule],
  controllers: [PaymentController],
  providers:   [PaymentService],
  exports:     [PaymentService],
})
export class PaymentModule {}