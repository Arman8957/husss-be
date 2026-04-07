// src/modules/payments/payment.controller.ts
import * as common from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam,
  ApiBody, ApiResponse,
} from '@nestjs/swagger';


import type {
  SubscriptionStatusResult, SetupIntentResult, MobileSubscribeResult,
  ConfirmPaymentResult, PaymentMethodsResult, CheckoutResult,
  PortalResult, CancelResult, WebhookResult
} from './type/stripe.type';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser  } from 'src/common/decorators/current-user.decorator';
import { PaymentService } from './stripe.service';
import { CancelSubscriptionDto, ConfirmPaymentDto, CreateCheckoutSessionDto, MobileSubscribeDto } from './dto/stripe.dto';


@ApiTags('💳 Payments & Subscriptions')
@common.Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ── Public (no auth) ─────────────────────────────────────────────────────

  @common.Get('plans')
  @ApiOperation({ summary: 'Get all active subscription plans (public)' })
  getPlans(): Promise<any[]> {
    return this.paymentService.getSubscriptionPlans();
  }

  @common.Get('plans/grouped')
  @ApiOperation({ summary: 'Get plans split into userPlans / coachPlans (public)' })
  getPlansGrouped(): Promise<{ userPlans: any[]; coachPlans: any[] }> {
    return this.paymentService.getPlansGrouped();
  }

  @common.Post('webhook')
  @common.HttpCode(common.HttpStatus.OK)
  @ApiOperation({
    summary: 'Stripe webhook — called by Stripe servers only',
    description:
      '⚠️ Do NOT test manually — Stripe signature verification will reject it.\n\n' +
      'Test via Stripe CLI:  `stripe listen --forward-to localhost:3000/api/v1/payments/webhook`\n' +
      'Or Stripe Dashboard: Developers → Webhooks → Send test event\n\n' +
      'Events handled:\n' +
      '- checkout.session.completed\n' +
      '- customer.subscription.updated\n' +
      '- customer.subscription.deleted\n' +
      '- invoice.payment_succeeded\n' +
      '- invoice.payment_failed',
  })
  handleWebhook(
    @common.Req()                       req: common.RawBodyRequest<Request>,
    @common.Headers('stripe-signature') signature: string,
  ): Promise<WebhookResult> {
    return this.paymentService.handleStripeWebhook(req.rawBody!, signature);
  }

  // ── Authenticated ─────────────────────────────────────────────────────────

  @common.Get('subscription')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:     'Get current subscription status',
    description: 'Returns plan, isPremium, status, currentPeriodEnd, stripeStatus (live from Stripe).',
  })
  getSubscription(@CurrentUser() user: any): Promise<SubscriptionStatusResult> {
    return this.paymentService.getCurrentSubscription(user.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📱 IN-APP PURCHASE — 3-Step Mobile Payment Flow
  // ═══════════════════════════════════════════════════════════════════════════

  @common.Post('iap/setup-intent')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @common.HttpCode(common.HttpStatus.OK)
  @ApiOperation({
    summary:     '📱 [Step 1] Get Setup Intent — init Payment Sheet',
    description: `
## Step 1 of 3 — Call BEFORE showing Stripe Payment Sheet

**⚠️ Body:** EMPTY — send \`{}\` or no body at all.
The user is identified from the JWT token.

**Returns 4 values to pass into Stripe Payment Sheet:**

| Field | Used for |
|---|---|
| \`setupIntentClientSecret\` | \`PaymentSheet.setup({ setupIntentClientSecret })\` |
| \`customerId\` | \`PaymentSheet.setup({ customer })\` |
| \`ephemeralKey\` | \`PaymentSheet.setup({ customerEphemeralKeySecret })\` |
| \`publishableKey\` | \`Stripe.init({ publishableKey })\` |

**Flutter example:**
\`\`\`dart
await Stripe.instance.initPaymentSheet(SetupPaymentSheetParameters(
  setupIntentClientSecret: data['setupIntentClientSecret'],
  customerId:              data['customerId'],
  customerEphemeralKeySecret: data['ephemeralKey'],
  merchantDisplayName: 'HUSSS',
));
await Stripe.instance.presentPaymentSheet();
\`\`\`

**After this step:** The user has entered + saved their card.
Now call Step 2 to create the subscription.
`,
  })
  @ApiBody({
    description: 'No body required. Send empty {} or omit body entirely.',
    required:    false,
    schema:      { type: 'object', example: {} },
  })
  @ApiResponse({ status: 200, description: 'Returns setupIntentClientSecret, ephemeralKey, customerId, publishableKey' })
  createSetupIntent(@CurrentUser() user: any): Promise<SetupIntentResult> {
    return this.paymentService.createSetupIntent(user.id);
  }

  @common.Post('iap/subscribe')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @common.HttpCode(common.HttpStatus.OK)
  @ApiOperation({
    summary:     '📱 [Step 2] Subscribe — charge card & activate plan',
    description: `
## Step 2 of 3 — After Payment Sheet saves card

**Body required:**
- \`plan\`: \`MONTHLY\` | \`ANNUAL\`
- \`planFor\`: \`user\` | \`coach\`
- \`paymentMethodId\`: from Stripe Payment Sheet

**Postman test cards (paymentMethodId):**
| Card | Result |
|---|---|
| \`pm_card_visa\` | ✅ Instant success |
| \`pm_card_mastercard\` | ✅ Instant success |
| \`pm_card_authenticationRequired\` | ⚠️ 3D Secure → do Step 3 |
| \`pm_card_chargeDeclined\` | ❌ Declined |
| \`pm_card_insufficientFunds\` | ❌ Insufficient funds |

**Response:**
- \`status='active'\` → subscription live, **no Step 3 needed**
- \`status='requires_action'\` → app must confirm 3D Secure, then **call Step 3**
- \`clientSecret\` → only present when status='requires_action'
`,
  })
  createMobileSubscription(
    @CurrentUser() user: any,
    @common.Body()        dto:  MobileSubscribeDto,
  ): Promise<MobileSubscribeResult> {
    return this.paymentService.createMobileSubscription(user.id, dto);
  }

  @common.Post('iap/confirm')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @common.HttpCode(common.HttpStatus.OK)
  @ApiOperation({
    summary:     '📱 [Step 3] Confirm — sync after 3D Secure (conditional)',
    description: `
## Step 3 of 3 — ONLY call if Step 2 returned \`status='requires_action'\`

**Mobile flow when 3D Secure is required:**
\`\`\`dart
// Flutter:
await Stripe.instance.confirmPayment(clientSecret);

// React Native:
await confirmPayment(clientSecret);

// Then call this endpoint:
POST /payments/iap/confirm { "subscriptionId": "sub_..." }
\`\`\`
`,
  })
  confirmPayment(
    @CurrentUser() user: any,
    @common.Body()        dto:  ConfirmPaymentDto,
  ): Promise<ConfirmPaymentResult> {
    return this.paymentService.confirmMobilePayment(user.id, dto.subscriptionId);
  }

  @common.Get('iap/payment-methods')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '📱 List saved payment methods (cards)' })
  getPaymentMethods(@CurrentUser() user: any): Promise<PaymentMethodsResult> {
    return this.paymentService.getPaymentMethods(user.id);
  }

  @common.Patch('iap/payment-methods/:pmId/default')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @common.HttpCode(common.HttpStatus.OK)
  @ApiOperation({ summary: '📱 Set default payment method for renewals' })
  @ApiParam({ name: 'pmId', description: 'Stripe payment method ID (pm_...)' })
  setDefault(
    @CurrentUser() user: any,
    @common.Param('pmId') pmId: string,
  ): Promise<{ success: boolean }> {
    return this.paymentService.setDefaultPaymentMethod(user.id, pmId);
  }

  @common.Delete('iap/payment-methods/:pmId')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @common.HttpCode(common.HttpStatus.OK)
  @ApiOperation({ summary: '📱 Remove a saved payment method' })
  @ApiParam({ name: 'pmId', description: 'Stripe payment method ID (pm_...)' })
  removePaymentMethod(
    @CurrentUser() user: any,
    @common.Param('pmId') pmId: string,
  ): Promise<{ success: boolean }> {
    return this.paymentService.removePaymentMethod(user.id, pmId);
  }

  // ── Web / Portal ──────────────────────────────────────────────────────────

  @common.Post('checkout')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @common.HttpCode(common.HttpStatus.CREATED)
  @ApiOperation({ summary: '🌐 [Web] Create Stripe Checkout Session (browser redirect)' })
  createCheckoutSession(
    @CurrentUser() user: any,
    @common.Body()        dto:  CreateCheckoutSessionDto,
  ): Promise<CheckoutResult> {
    return this.paymentService.createCheckoutSession(user.id, dto);
  }

  @common.Post('portal')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @common.HttpCode(common.HttpStatus.CREATED)
  @ApiOperation({ summary: '🌐 [Web] Open Stripe Billing Portal (manage card / cancel)' })
  createPortalSession(@CurrentUser() user: any): Promise<PortalResult> {
    return this.paymentService.createBillingPortalSession(user.id);
  }

  @common.Post('cancel')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @common.HttpCode(common.HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription (at period end or immediately)' })
  cancelSubscription(
    @CurrentUser() user: any,
    @common.Body()        dto:  CancelSubscriptionDto,
  ): Promise<CancelResult> {
    return this.paymentService.cancelSubscription(user.id, dto);
  }

  @common.Get('history')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get payment transaction history (last 100)' })
  getHistory(@CurrentUser() user: any): Promise<any[]> {
    return this.paymentService.getPaymentHistory(user.id);
  }
}