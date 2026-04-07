// src/modules/payments/payment.module.ts
import { Module }          from '@nestjs/common';
import { ConfigModule }    from '@nestjs/config';
import { PrismaModule }    from 'src/prisma/prisma.module';
import { PaymentController } from './stripe .controller';
import { PaymentService } from './stripe.service';


@Module({
  imports:     [PrismaModule, ConfigModule],
  controllers: [PaymentController],
  providers:   [PaymentService],
  exports:     [PaymentService],
})
export class PaymentModule {}

// ADD to app.module.ts:
// import { PaymentModule } from './modules/payments/payment.module';
// imports: [..., PaymentModule]