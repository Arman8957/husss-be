// src/modules/payments/iap.module.ts
import { Module }        from '@nestjs/common';

import { PrismaModule }  from 'src/prisma/prisma.module';
import { IAPController } from './payment.controller';
import { IAPService } from './payment.service';

@Module({
  imports:     [PrismaModule],
  controllers: [IAPController],
  providers:   [IAPService],
  exports:     [IAPService],
})
export class IAPModule {}

// ADD to app.module.ts:
// import { IAPModule } from './modules/payments/iap.module';
// imports: [..., IAPModule]