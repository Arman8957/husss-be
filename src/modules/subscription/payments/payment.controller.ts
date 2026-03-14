// src/modules/payments/payment.controller.ts
import * as common from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
// ✅ FIX: isolatedModules — import DTOs as regular values (classes), NOT `import type`.
// NestJS needs the class reference at runtime for ValidationPipe + metadata.
import { CreateCheckoutSessionDto, CancelSubscriptionDto } from './dto/payment.dto';
// ✅ FIX: TS4053 "Return type cannot be named" — import from shared types file
import type {
  SubscriptionStatusResult,
  CheckoutResult,
  PortalResult,
  CancelResult,
  WebhookResult,
} from '../../../common/types/payment.types';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser  } from 'src/common/decorators/current-user.decorator';

@ApiTags('Payments')
@common.Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — No auth required
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/payments/plans
   * All active subscription plan configs (flat list, sorted by price).
   * Used for the pricing screen before user logs in.
   *
   * Admin manages these in: Admin Panel → Premium Features → Subscription Plans
   */
  @common.Get('plans')
  @ApiOperation({ summary: 'Get all active subscription plans' })
  getPlans(): Promise<any[]> {
    return this.paymentService.getSubscriptionPlans();
  }

  /**
   * GET /api/v1/payments/plans/grouped
   * Plans split into { userPlans, coachPlans }.
   *
   * Admin marks coach plans by including "Coach" in the name:
   *   "Coach Annual"  → coachPlans
   *   "Annual"        → userPlans
   *
   * Maps to the two subscription screens:
   *   Coach screen  → coachPlans  (Free + $59.99/yr)
   *   User screen   → userPlans   ($59.99/yr Annual + $9.99/mo Monthly)
   */
  @common.Get('plans/grouped')
  @ApiOperation({ summary: 'Get plans split into userPlans and coachPlans' })
  getPlansGrouped(): Promise<{ userPlans: any[]; coachPlans: any[] }> {
    return this.paymentService.getPlansGrouped();
  }

  /**
   * POST /api/v1/payments/webhook
   * Stripe webhook — called directly by Stripe, never by the app.
   *
   * ─── SETUP REQUIRED ───────────────────────────────────────────────────
   *
   * 1. main.ts — BEFORE app.useGlobalPipes():
   *      const app = await NestFactory.create(AppModule, { rawBody: true });
   *
   * 2. Stripe Dashboard → Developers → Webhooks → Add endpoint:
   *      URL: https://yourdomain.com/api/v1/payments/webhook
   *      Events to select:
   *        ✅ checkout.session.completed
   *        ✅ customer.subscription.updated
   *        ✅ customer.subscription.deleted
   *        ✅ invoice.payment_succeeded
   *        ✅ invoice.payment_failed
   *
   * 3. Copy the Signing Secret → set STRIPE_WEBHOOK_SECRET in .env
   *
   * Always returns 200 — if we throw, Stripe retries indefinitely.
   */
  @common.Post('webhook')
  @common.HttpCode(common.HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook — internal use by Stripe only' })
  handleWebhook(
    @common.Req()                                 req: common.RawBodyRequest<Request>,
    @common.Headers('stripe-signature')           signature: string,
  ): Promise<WebhookResult> {
    return this.paymentService.handleStripeWebhook(req.rawBody!, signature);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED — JWT required
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/payments/subscription
   * Current user's live subscription status.
   *
   * Response:
   *   plan               FREE | MONTHLY | ANNUAL
   *   status             ACTIVE | CANCELLED | EXPIRED | TRIALING | PAST_DUE
   *   isPremium          boolean
   *   isCoachPremium     boolean
   *   maxClients         number  (0 = free, 999 = unlimited premium coach)
   *   currentPeriodEnd   Date    (when billing cycle ends)
   *   cancelAtPeriodEnd  boolean (true = cancellation scheduled)
   *   stripeStatus       string  (live from Stripe API)
   */
  @common.Get('subscription')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current subscription status' })
  getSubscription(@CurrentUser() user: any): Promise<SubscriptionStatusResult> {
    return this.paymentService.getCurrentSubscription(user.id);
  }

  /**
   * POST /api/v1/payments/checkout
   * Create a Stripe Checkout Session and return the payment URL.
   *
   * Body:
   *   plan        MONTHLY | ANNUAL
   *   planFor     "user" | "coach"
   *   successUrl? Redirect URL after successful payment
   *   cancelUrl?  Redirect URL if user cancels at checkout
   *
   * Response:
   *   sessionId   Stripe session ID (for Stripe.js confirmPayment if needed)
   *   url         Open this URL in browser/webview — Stripe hosted checkout
   *   planName    Human readable plan name
   *   amount      Price in USD
   *
   * After payment:
   *   Stripe fires checkout.session.completed → webhook handler → subscription activated
   */
  @common.Post('checkout')
  @common.UseGuards(JwtAuthGuard)
  @common.HttpCode(common.HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  @ApiBody({ type: CreateCheckoutSessionDto })
  createCheckout(
    @CurrentUser() user: any,
    @common.Body()        dto:  CreateCheckoutSessionDto,
  ): Promise<CheckoutResult> {
    return this.paymentService.createCheckoutSession(user.id, dto);
  }

  /**
   * GET /api/v1/payments/portal
   * Create a Stripe Customer Portal session.
   *
   * Response:
   *   url   Open this in browser — Stripe's hosted billing management page
   *
   * User can in the portal:
   *   - Update card / payment method
   *   - View invoice history and download receipts
   *   - Cancel subscription
   *   - Reactivate a cancelled subscription
   *
   * Requires an existing Stripe subscription.
   */
  @common.Get('portal')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get Stripe billing portal URL' })
  getBillingPortal(@CurrentUser() user: any): Promise<PortalResult> {
    return this.paymentService.createBillingPortalSession(user.id);
  }

  /**
   * POST /api/v1/payments/cancel
   * Cancel the current user's subscription.
   *
   * Body:
   *   atPeriodEnd  true  (default) — cancel at end of billing cycle, user keeps access
   *                false           — cancel immediately, access revoked now
   *
   * Response:
   *   message        Confirmation message
   *   effectiveDate  When access ends (only present when atPeriodEnd=true)
   */
  @common.Post('cancel')
  @common.UseGuards(JwtAuthGuard)
  @common.HttpCode(common.HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiBody({ type: CancelSubscriptionDto })
  cancelSubscription(
    @CurrentUser() user: any,
    @common.Body()        dto:  CancelSubscriptionDto,
  ): Promise<CancelResult> {
    return this.paymentService.cancelSubscription(user.id, dto);
  }

  /**
   * GET /api/v1/payments/history
   * User's full payment transaction history.
   *
   * Returns PaymentTransaction records:
   *   status       SUCCEEDED | FAILED | REFUNDED | PENDING
   *   amount       number (USD)
   *   currency     string (e.g. "USD")
   *   plan         MONTHLY | ANNUAL
   *   description  Human readable description
   *   createdAt    Date of transaction
   */
  @common.Get('history')
  @common.UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get payment transaction history' })
  getHistory(@CurrentUser() user: any): Promise<any[]> {
    return this.paymentService.getPaymentHistory(user.id);
  }
}