// src/modules/subscription-plans/subscription-plans.module.ts
import { Module }                      from '@nestjs/common';
import { PrismaModule }                from 'src/prisma/prisma.module';
import { SubscriptionPlansController } from './subscriptionsPlan.controller';
import { SubscriptionPlansService } from './subscriptionsPlan.service';


@Module({
  imports:     [PrismaModule],
  controllers: [SubscriptionPlansController],
  providers:   [SubscriptionPlansService],
  exports:     [SubscriptionPlansService],
})
export class SubscriptionPlansModule {}

// ── ADD to app.module.ts ─────────────────────────────────────────────────────
// import { SubscriptionPlansModule } from './modules/subscription-plans/subscription-plans.module';
// imports: [..., SubscriptionPlansModule]