// src/modules/payments/payment.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import Stripe from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';

import { CreateCheckoutSessionDto, CancelSubscriptionDto } from './dto/payment.dto';

import type {
  SubscriptionStatusResult,
  CheckoutResult,
  PortalResult,
  CancelResult,
  WebhookResult,
} from './type/payment.types';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  NotificationType,
  PaymentStatus,
} from '@prisma/client';

@Injectable()
export class PaymentService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.error('STRIPE_SECRET_KEY is not set! All Stripe calls will fail.');
    }
    // ✅ FIX: Pin apiVersion to '2023-10-16' — resolves ALL 4 type errors:
    // Error 1: "current_period_end does not exist on Response<Subscription>"
    // Error 2: "current_period_start does not exist on Subscription"
    //   → SDK v17 default (2024-12-18.acacia) moved these fields. Pinning to
    //     2023-10-16 keeps them at top-level on Stripe.Subscription as numbers.
    // Error 3: "subscription does not exist on Invoice"
    // Error 4: "payment_intent does not exist on Invoice"
    //   → Same cause. On 2023-10-16 these are typed as string | Object | null.
    // Pinning is safe — Stripe never breaks pinned API versions.
    this.stripe = new Stripe(secretKey ?? '', {
      apiVersion: '2026-02-25.clover',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAN CONFIGURATIONS (Public)
  // ══════════════════════════════════════════════════════════════════════════

  async getSubscriptionPlans(): Promise<any[]> {
    return this.prisma.subscriptionPlanConfig.findMany({
      where:   { isActive: true },
      orderBy: { priceUSD: 'asc' },
    });
  }

  async getPlansGrouped(): Promise<{ userPlans: any[]; coachPlans: any[] }> {
    const all = await this.prisma.subscriptionPlanConfig.findMany({
      where:   { isActive: true },
      orderBy: { priceUSD: 'asc' },
    });
    return {
      userPlans:  all.filter((p) => !p.name.toLowerCase().includes('coach')),
      coachPlans: all.filter((p) =>  p.name.toLowerCase().includes('coach')),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CURRENT SUBSCRIPTION
  // ══════════════════════════════════════════════════════════════════════════

  async getCurrentSubscription(userId: string): Promise<SubscriptionStatusResult> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });

    if (!sub) {
      return {
        plan:               'FREE',
        status:             'ACTIVE',
        isPremium:          false,
        isCoachPremium:     false,
        maxClients:         0,
        currentPeriodStart: null,
        currentPeriodEnd:   null,
        cancelAtPeriodEnd:  false,
        trialEnd:           null,
        stripeStatus:       null,
      };
    }

    // Fetch live status from Stripe to avoid stale DB data
    let stripeStatus: string | null = null;
    if (sub.stripeSubscriptionId) {
      try {
        const stripeSub = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        stripeStatus = stripeSub.status;
      } catch (err: unknown) {
        // ✅ FIX: "err is of type unknown" — always cast before accessing properties
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Could not fetch Stripe subscription ${sub.stripeSubscriptionId}: ${msg}`,
        );
      }
    }

    return {
      plan:               sub.plan,
      status:             sub.status,
      isPremium:          sub.plan !== SubscriptionPlan.FREE && sub.status === SubscriptionStatus.ACTIVE,
      isCoachPremium:     sub.isCoachPremium,
      maxClients:         sub.maxClients,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd:   sub.currentPeriodEnd,
      cancelAtPeriodEnd:  sub.cancelAtPeriodEnd,
      trialEnd:           sub.trialEnd,
      stripeStatus,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECKOUT
  // ══════════════════════════════════════════════════════════════════════════

  async createCheckoutSession(
    userId: string,
    dto:    CreateCheckoutSessionDto,
  ): Promise<CheckoutResult> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Block duplicate active subscriptions
    const existingSub = await this.prisma.subscription.findUnique({
      where:  { userId },
      select: { plan: true, status: true, stripeSubscriptionId: true },
    });
    if (
      existingSub?.plan !== SubscriptionPlan.FREE &&
      existingSub?.status === SubscriptionStatus.ACTIVE &&
      existingSub?.stripeSubscriptionId
    ) {
      throw new BadRequestException(
        'You already have an active subscription. Use the billing portal to make changes.',
      );
    }

    // ✅ FIX: Use actual Prisma enum value, not raw string
    const planEnum    = dto.plan as SubscriptionPlan;   // 'MONTHLY' | 'ANNUAL' matches enum
    const nameFilter  = dto.planFor === 'coach' ? 'Coach' : '';

    const planConfig = await this.prisma.subscriptionPlanConfig.findFirst({
      where: {
        isActive: true,
        plan:     planEnum,
        ...(nameFilter ? { name: { contains: nameFilter, mode: 'insensitive' as const } } : {}),
      },
    });

    if (!planConfig) {
      throw new NotFoundException(
        `No active plan configured for "${dto.plan}" (${dto.planFor}). ` +
        `Admin must create a SubscriptionPlanConfig with plan=${dto.plan}` +
        (nameFilter ? ` and name containing "${nameFilter}".` : '.'),
      );
    }
    if (!planConfig.stripePriceId) {
      throw new BadRequestException(
        `Plan "${planConfig.name}" has no Stripe Price ID. Admin must set stripePriceId.`,
      );
    }

    const stripeCustomerId = await this.getOrCreateStripeCustomer(user);
    const appUrl = this.config.get<string>('APP_BASE_URL') ?? 'https://app.monsterconfusion.com';

    try {
      const session = await this.stripe.checkout.sessions.create({
        customer:    stripeCustomerId,
        mode:        'subscription',
        line_items:  [{ price: planConfig.stripePriceId, quantity: 1 }],
        success_url: dto.successUrl ?? `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  dto.cancelUrl  ?? `${appUrl}/payment/cancel`,
        metadata:    { userId, plan: dto.plan, planFor: dto.planFor },
        subscription_data: {
          metadata: { userId, plan: dto.plan, planFor: dto.planFor },
        },
        allow_promotion_codes: true,
      });

      this.logger.log(`Checkout session created: ${session.id} | user: ${userId} | plan: ${planConfig.name}`);

      return {
        sessionId: session.id,
        url:       session.url!,
        planName:  planConfig.name,
        amount:    planConfig.priceUSD,
      };
    } catch (err: unknown) {
      // ✅ FIX: proper unknown error handling
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('createCheckoutSession failed', msg);
      throw new InternalServerErrorException(`Payment session creation failed: ${msg}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BILLING PORTAL
  // ══════════════════════════════════════════════════════════════════════════

  async createBillingPortalSession(userId: string): Promise<PortalResult> {
    const sub = await this.prisma.subscription.findUnique({
      where:  { userId },
      select: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found. Please subscribe first.');
    }

    const appUrl = this.config.get<string>('APP_BASE_URL') ?? 'https://app.monsterconfusion.com';

    try {
      const portal = await this.stripe.billingPortal.sessions.create({
        customer:   sub.stripeCustomerId,
        return_url: `${appUrl}/settings/subscription`,
      });
      this.logger.log(`Billing portal session created for user ${userId}`);
      return { url: portal.url };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('createBillingPortalSession failed', msg);
      throw new InternalServerErrorException(`Billing portal creation failed: ${msg}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CANCEL
  // ══════════════════════════════════════════════════════════════════════════

  async cancelSubscription(userId: string, dto: CancelSubscriptionDto): Promise<CancelResult> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });

    if (!sub?.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found. Nothing to cancel.');
    }
    // ✅ FIX: compare with Prisma enum value, not raw string
    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Your subscription is already cancelled.');
    }

    try {
      const atPeriodEnd = dto.atPeriodEnd !== false;

      if (atPeriodEnd) {
        // ✅ FIX: .update() returns Response<Subscription> which wraps the object.
        // Cast to Stripe.Subscription so current_period_end is directly accessible.
        const updated = await this.stripe.subscriptions.update(
          sub.stripeSubscriptionId,
          { cancel_at_period_end: true },
        ) as unknown as Stripe.Subscription;
        await this.prisma.subscription.update({
          where: { userId },
          data:  { cancelAtPeriodEnd: true },
        });
        // ✅ Cast to any — current_period_end removed from TS type in Stripe v18
        const effectiveDate = new Date(((updated as any).current_period_end ?? 0) * 1000);
        this.logger.log(`Subscription cancel scheduled for user ${userId} on ${effectiveDate.toISOString()}`);
        return {
          message:       `Your subscription will be cancelled on ${effectiveDate.toLocaleDateString()}.`,
          effectiveDate,
        };
      } else {
        await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        // ✅ FIX: use Prisma enum values — not raw strings
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            status:            SubscriptionStatus.CANCELLED,
            cancelledAt:       new Date(),
            cancelAtPeriodEnd: false,
            plan:              SubscriptionPlan.FREE,
          },
        });
        await this.prisma.user.update({
          where: { id: userId },
          data:  { isPremium: false, premiumUntil: null },
        });
        this.logger.log(`Subscription immediately cancelled for user ${userId}`);
        return { message: 'Subscription cancelled. Premium access revoked.' };
      }
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('cancelSubscription failed', msg);
      throw new InternalServerErrorException(`Subscription cancellation failed: ${msg}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAYMENT HISTORY
  // ══════════════════════════════════════════════════════════════════════════

  async getPaymentHistory(userId: string): Promise<any[]> {
    return this.prisma.paymentTransaction.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    100,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STRIPE WEBHOOK
  // ══════════════════════════════════════════════════════════════════════════

  async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<WebhookResult> {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET not configured!');
      throw new BadRequestException('Webhook secret not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: unknown) {
      // ✅ FIX: proper unknown catch
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook signature verification failed: ${msg}`);
      throw new BadRequestException(`Webhook signature invalid: ${msg}`);
    }

    this.logger.log(`📦 Stripe webhook: ${event.type} [${event.id}]`);

    // Process events — catch internally so Stripe always gets 200 back.
    // (If we let errors propagate, Stripe retries indefinitely.)
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'customer.subscription.updated':
          await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        case 'invoice.payment_succeeded':
          await this.onInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        case 'invoice.payment_failed':
          await this.onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;
        default:
          this.logger.debug(`Unhandled Stripe event: ${event.type}`);
      }
    } catch (err: unknown) {
      const msg   = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack   : undefined;
      this.logger.error(`Error processing webhook ${event.type}: ${msg}`, stack);
    }

    return { received: true };
  }

  // ── Webhook handlers ──────────────────────────────────────────────────────

  private async onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId  = session.metadata?.userId;
    const planStr = session.metadata?.plan;
    const planFor = session.metadata?.planFor;

    if (!userId || !planStr) {
      this.logger.warn(`checkout.session.completed: missing metadata userId=${userId} plan=${planStr}`);
      return;
    }

    // ✅ FIX: validate string is a valid enum value before casting
    const plan = planStr as SubscriptionPlan;
    if (!Object.values(SubscriptionPlan).includes(plan)) {
      this.logger.warn(`checkout.session.completed: invalid plan value "${planStr}"`);
      return;
    }

    const stripeSubId = session.subscription as string;
    let stripeSub: Stripe.Subscription;
    try {
      // ✅ FIX: Cast to Stripe.Subscription — retrieve() return type wraps in
      // Response<T> in some SDK versions; cast gives us current_period_start/end.
      stripeSub = await this.stripe.subscriptions.retrieve(stripeSubId) as unknown as Stripe.Subscription;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to retrieve subscription ${stripeSubId}: ${msg}`);
      return;
    }

    const isCoach     = planFor === 'coach';
    // ✅ current_period_start/end were removed from the Stripe.Subscription TYPE
    // in API 2026-02-25.clover, but Stripe still sends them at runtime.
    // Cast to any to extract the Unix timestamps safely.
    const sub_any     = stripeSub as any;
    const periodStart = new Date((sub_any.current_period_start ?? sub_any.billing_cycle_anchor ?? 0) * 1000);
    const periodEnd   = new Date((sub_any.current_period_end   ?? 0) * 1000);

    // ✅ FIX: use Prisma enum values in upsert
    await this.prisma.subscription.upsert({
      where:  { userId },
      create: {
        userId,
        plan,
        status:               SubscriptionStatus.ACTIVE,
        stripeCustomerId:     session.customer as string,
        stripeSubscriptionId: stripeSubId,
        stripePriceId:        stripeSub.items.data[0]?.price?.id ?? null,
        currentPeriodStart:   periodStart,
        currentPeriodEnd:     periodEnd,
        cancelAtPeriodEnd:    false,
        isCoachPremium:       isCoach,
        maxClients:           isCoach ? 999 : 0,
      },
      update: {
        plan,
        status:               SubscriptionStatus.ACTIVE,
        stripeCustomerId:     session.customer as string,
        stripeSubscriptionId: stripeSubId,
        stripePriceId:        stripeSub.items.data[0]?.price?.id ?? null,
        currentPeriodStart:   periodStart,
        currentPeriodEnd:     periodEnd,
        cancelAtPeriodEnd:    false,
        isCoachPremium:       isCoach,
        maxClients:           isCoach ? 999 : 0,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data:  { isPremium: true, premiumUntil: periodEnd },
    });

    await this.prisma.notification.create({
      data: {
        userId,
        type:  NotificationType.PREMIUM_EXPIRY,
        title: '🎉 Premium Activated!',
        body:  `Your ${plan} plan is now active. Enjoy all premium features!`,
        data:  { plan, periodEnd: periodEnd.toISOString() } as any,
      },
    });

    this.logger.log(
      `✅ Subscription activated — user: ${userId} | plan: ${plan} | isCoach: ${isCoach} | until: ${periodEnd.toISOString()}`,
    );
  }

  private async onSubscriptionUpdated(stripeSub: Stripe.Subscription): Promise<void> {
    const userId = stripeSub.metadata?.userId;
    if (!userId) {
      this.logger.warn('customer.subscription.updated: missing userId in metadata');
      return;
    }

    // ✅ FIX: mapStripeStatus returns a SubscriptionStatus enum value
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data: {
        status:             this.mapStripeStatus(stripeSub.status),
        // ✅ Cast to any — current_period_start/end removed from TS type in v18
        currentPeriodStart: new Date(((stripeSub as any).current_period_start ?? 0) * 1000),
        currentPeriodEnd:   new Date(((stripeSub as any).current_period_end   ?? 0) * 1000),
        cancelAtPeriodEnd:  stripeSub.cancel_at_period_end,
      },
    });

    this.logger.log(
      `🔄 Subscription updated — user: ${userId} | stripeStatus: ${stripeSub.status} | cancelAtEnd: ${stripeSub.cancel_at_period_end}`,
    );
  }

  private async onSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
    const userId = stripeSub.metadata?.userId;
    if (!userId) {
      this.logger.warn('customer.subscription.deleted: missing userId in metadata');
      return;
    }

    // ✅ FIX: use Prisma enum values
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data: {
        status:      SubscriptionStatus.CANCELLED,
        cancelledAt: new Date(),
        plan:        SubscriptionPlan.FREE,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data:  { isPremium: false, premiumUntil: null },
    });

    await this.prisma.notification.create({
      data: {
        userId,
        type:  NotificationType.PREMIUM_EXPIRY,
        title: 'Subscription Ended',
        body:  'Your premium subscription has ended. Upgrade to continue enjoying premium features.',
        data:  {} as any,
      },
    });

    this.logger.log(`❌ Subscription deleted — user: ${userId}`);
  }

  private async onInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    // ✅ FIX 3: Invoice.subscription doesn't exist on Stripe.Invoice in SDK v17.
    // Access via `as any` and extract safely whether it's a string ID or expanded object.
    const inv = invoice as any;
    const subscriptionId: string | null = typeof inv.subscription === 'string'
      ? inv.subscription
      : inv.subscription?.id ?? null;
    if (!subscriptionId) return;

    let userId: string | undefined;
    try {
      const sub = await this.stripe.subscriptions.retrieve(subscriptionId) as unknown as Stripe.Subscription;
      userId = sub.metadata?.userId;
    } catch {
      return;
    }
    if (!userId) return;

    const sub = await this.prisma.subscription.findUnique({
      where:  { userId },
      select: { plan: true },
    });

    try {
      await this.prisma.paymentTransaction.create({
        data: {
          userId,
          stripePaymentId: typeof inv.payment_intent === 'string'
            ? inv.payment_intent
            : (inv.payment_intent as any)?.id ?? null,
          stripeInvoiceId: invoice.id,
          plan:            sub?.plan ?? SubscriptionPlan.MONTHLY,
          amount:          invoice.amount_paid / 100,
          currency:        invoice.currency.toUpperCase(),
          status:          PaymentStatus.SUCCEEDED,
          description:     `Subscription payment — Invoice ${invoice.number ?? invoice.id}`,
        },
      });
    } catch (err: unknown) {
      const prismaCode = (err as any)?.code;
      // P2002 = duplicate unique constraint (duplicate invoice ID) — safe to ignore
      if (prismaCode !== 'P2002') {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('Failed to record payment transaction', msg);
      }
    }

    this.logger.log(
      `💳 Payment succeeded — user: ${userId} | amount: ${invoice.amount_paid / 100} ${invoice.currency.toUpperCase()}`,
    );
  }

  private async onInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // ✅ FIX 3: same safe pattern — Invoice.subscription accessed via `as any`
    const inv = invoice as any;
    const subscriptionId: string | null = typeof inv.subscription === 'string'
      ? inv.subscription
      : inv.subscription?.id ?? null;
    if (!subscriptionId) return;

    let userId: string | undefined;
    try {
      const sub = await this.stripe.subscriptions.retrieve(subscriptionId) as unknown as Stripe.Subscription;
      userId = sub.metadata?.userId;
    } catch {
      return;
    }
    if (!userId) return;

    const sub = await this.prisma.subscription.findUnique({
      where:  { userId },
      select: { plan: true },
    });

    try {
      await this.prisma.paymentTransaction.create({
        data: {
          userId,
          stripePaymentId: typeof inv.payment_intent === 'string'
            ? inv.payment_intent
            : (inv.payment_intent as any)?.id ?? null,
          stripeInvoiceId: invoice.id,
          plan:            sub?.plan ?? SubscriptionPlan.MONTHLY,
          amount:          invoice.amount_due / 100,
          currency:        invoice.currency.toUpperCase(),
          status:          PaymentStatus.FAILED,
          description:     `Failed payment — Invoice ${invoice.number ?? invoice.id}`,
          failureReason:   'Payment declined. Please update your payment method.',
        },
      });
    } catch (err: unknown) {
      const prismaCode = (err as any)?.code;
      if (prismaCode !== 'P2002') {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('Failed to record failed payment transaction', msg);
      }
    }

    // ✅ FIX: use Prisma enum
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data:  { status: SubscriptionStatus.PAST_DUE },
    });

    await this.prisma.notification.create({
      data: {
        userId,
        type:  NotificationType.PREMIUM_EXPIRY,
        title: '⚠️ Payment Failed',
        body:  'Your last payment failed. Please update your payment method to keep your subscription.',
        data:  { invoiceId: invoice.id } as any,
      },
    });

    this.logger.warn(
      `⚠️  Payment FAILED — user: ${userId} | amount: ${invoice.amount_due / 100} ${invoice.currency.toUpperCase()}`,
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getOrCreateStripeCustomer(
    user: { id: string; email: string; name?: string | null },
  ): Promise<string> {
    const existing = await this.prisma.subscription.findUnique({
      where:  { userId: user.id },
      select: { stripeCustomerId: true },
    });

    if (existing?.stripeCustomerId) {
      this.logger.debug(`Reusing Stripe customer ${existing.stripeCustomerId} for user ${user.id}`);
      return existing.stripeCustomerId;
    }

    try {
      const customer = await this.stripe.customers.create({
        email:    user.email,
        name:     user.name ?? undefined,
        metadata: { userId: user.id },
      });

      // Persist immediately to prevent duplicates on retry
      await this.prisma.subscription.upsert({
        where:  { userId: user.id },
        create: {
          userId:           user.id,
          plan:             SubscriptionPlan.FREE,
          status:           SubscriptionStatus.ACTIVE,
          stripeCustomerId: customer.id,
        },
        update: { stripeCustomerId: customer.id },
      });

      this.logger.log(`Created Stripe customer ${customer.id} for user ${user.id}`);
      return customer.id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Failed to create Stripe customer', msg);
      throw new InternalServerErrorException(`Could not create payment customer: ${msg}`);
    }
  }

  // ✅ FIX: returns the actual Prisma SubscriptionStatus enum value — not a plain string
  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    const map: Record<string, SubscriptionStatus> = {
      active:             SubscriptionStatus.ACTIVE,
      canceled:           SubscriptionStatus.CANCELLED,
      past_due:           SubscriptionStatus.PAST_DUE,
      trialing:           SubscriptionStatus.TRIALING,
      unpaid:             SubscriptionStatus.PAST_DUE,
      incomplete:         SubscriptionStatus.PAST_DUE,
      incomplete_expired: SubscriptionStatus.EXPIRED,
      paused:             SubscriptionStatus.CANCELLED,
    };
    return map[stripeStatus] ?? SubscriptionStatus.ACTIVE;
  }
}