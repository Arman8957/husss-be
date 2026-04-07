// src/modules/payments/payment.service.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// STRIPE IN-APP PURCHASE SERVICE
//
// MOBILE PAYMENT FLOW (Payment Sheet — no browser redirect):
//
//   Step 1 → POST /payments/iap/setup-intent
//            Returns credentials to init Stripe Payment Sheet.
//            NO BODY NEEDED — user identified from JWT.
//
//   Step 2 → POST /payments/iap/subscribe
//            Body: { plan, planFor, paymentMethodId }
//            Creates subscription and charges the card.
//
//   Step 3 → POST /payments/iap/confirm  (ONLY if step 2 returns requires_action)
//            Body: { subscriptionId }
//            Syncs DB after 3D Secure confirmation.
//
// INSTALL:   npm install stripe
// ENV VARS:  STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
// main.ts:   NestFactory.create(AppModule, { rawBody: true })
// ══════════════════════════════════════════════════════════════════════════════

import {
  Injectable, BadRequestException, NotFoundException,
  InternalServerErrorException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe            from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  MobileSubscribeDto, CancelSubscriptionDto, CreateCheckoutSessionDto
} from './dto/stripe.dto';
import type {
  SubscriptionStatusResult, SetupIntentResult, MobileSubscribeResult,
  ConfirmPaymentResult, PaymentMethodsResult, CheckoutResult,
  PortalResult, CancelResult, WebhookResult
} from './type/stripe.type';
import {
  SubscriptionPlan, SubscriptionStatus, NotificationType, PaymentStatus,
} from '@prisma/client';



@Injectable()
export class PaymentService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) this.logger.error('STRIPE_SECRET_KEY is not configured!');
    this.stripe = new Stripe(key ?? '', { apiVersion: '2026-02-25.clover' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — Plans
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
  // SUBSCRIPTION STATUS
  // ══════════════════════════════════════════════════════════════════════════

  async getCurrentSubscription(userId: string): Promise<SubscriptionStatusResult> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });

    if (!sub) {
      return {
        plan: 'FREE', status: 'ACTIVE', isPremium: false, isCoachPremium: false,
        maxClients: 0, currentPeriodStart: null, currentPeriodEnd: null,
        cancelAtPeriodEnd: false, trialEnd: null, stripeStatus: null,
      };
    }

    // Sync live status from Stripe
    let stripeStatus: string | null = null;
    if (sub.stripeSubscriptionId) {
      try {
        const s      = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        stripeStatus = s.status;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Stripe retrieve failed for ${sub.stripeSubscriptionId}: ${msg}`);
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
  // STEP 1 — Setup Intent
  // ══════════════════════════════════════════════════════════════════════════

  async createSetupIntent(userId: string): Promise<SetupIntentResult> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const customerId = await this.getOrCreateStripeCustomer(user);

    // Ephemeral key — gives mobile SDK temporary access to Stripe customer
    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2026-02-25.clover' },
    );

    // SetupIntent — saves card without charging (usage='off_session' for subscriptions)
    const setupIntent = await this.stripe.setupIntents.create({
      customer:             customerId,
      payment_method_types: ['card'],
      usage:                'off_session',
      metadata:             { userId },
    });

    this.logger.log(`[IAP] SetupIntent created — user=${userId} customer=${customerId}`);

    return {
      customerId,
      setupIntentClientSecret: setupIntent.client_secret!,
      ephemeralKey:            ephemeralKey.secret!,
      publishableKey:          this.config.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Subscribe (create subscription with saved card)
  // ══════════════════════════════════════════════════════════════════════════

  async createMobileSubscription(
    userId: string,
    dto:    MobileSubscribeDto,
  ): Promise<MobileSubscribeResult> {
    // ── Validate user ──────────────────────────────────────────────────────
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // ── Block duplicate active subscriptions ──────────────────────────────
    const existing = await this.prisma.subscription.findUnique({
      where:  { userId },
      select: { plan: true, status: true, stripeSubscriptionId: true },
    });
    if (
      existing?.plan !== SubscriptionPlan.FREE &&
      existing?.status === SubscriptionStatus.ACTIVE &&
      existing?.stripeSubscriptionId
    ) {
      throw new BadRequestException(
        'You already have an active subscription. Cancel it before subscribing to a new plan.',
      );
    }

    // ── Get plan config with Stripe price ID ──────────────────────────────
    const nameFilter = dto.planFor === 'coach' ? 'Coach' : '';
    const planConfig = await this.prisma.subscriptionPlanConfig.findFirst({
      where: {
        isActive: true,
        plan:     dto.plan as SubscriptionPlan,
        ...(nameFilter ? { name: { contains: nameFilter, mode: 'insensitive' as const } } : {}),
      },
    });

    if (!planConfig) {
      throw new NotFoundException(
        `No plan config found for plan="${dto.plan}" planFor="${dto.planFor}". ` +
        `Admin must create a SubscriptionPlanConfig record first.`,
      );
    }
    if (!planConfig.stripePriceId) {
      throw new BadRequestException(
        `Plan "${planConfig.name}" has no Stripe Price ID. ` +
        `Admin must set the stripePriceId field (from Stripe Dashboard → Products).`,
      );
    }

    const customerId = await this.getOrCreateStripeCustomer(user);

    // ── Attach payment method to customer ─────────────────────────────────
    try {
      await this.stripe.paymentMethods.attach(dto.paymentMethodId, { customer: customerId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already been attached')) {
        throw new BadRequestException(`Payment method error: ${msg}`);
      }
    }

    // Set as default for future invoices
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: dto.paymentMethodId },
    });

    // ── Create Stripe subscription ─────────────────────────────────────────
    let subscription: Stripe.Subscription;
    try {
      subscription = await this.stripe.subscriptions.create({
        customer:              customerId,
        items:                 [{ price: planConfig.stripePriceId }],
        default_payment_method: dto.paymentMethodId,
        expand:                ['latest_invoice.payment_intent'],
        metadata:              { userId, plan: dto.plan, planFor: dto.planFor },
        payment_settings: {
          payment_method_types:        ['card'],
          save_default_payment_method: 'on_subscription',
        },
      }) as unknown as Stripe.Subscription;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[IAP] Stripe subscription creation failed: ${msg}`);
      throw new BadRequestException(`Subscription failed: ${msg}`);
    }

    // ── Extract payment intent (for 3D Secure) ────────────────────────────
    const latestInvoice = (subscription as any).latest_invoice as any;
    const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | null;
    const clientSecret  = paymentIntent?.client_secret ?? null;

    const sub_any    = subscription as any;
    const periodEnd  = sub_any.current_period_end
      ? new Date(sub_any.current_period_end * 1000) : null;
    const periodStart = sub_any.current_period_start
      ? new Date(sub_any.current_period_start * 1000) : new Date();
    const isCoach    = dto.planFor === 'coach';
    const subStatus  = subscription.status;

    // ── Pre-activate in DB (webhook will confirm final state) ─────────────
    if (subStatus === 'active' || subStatus === 'trialing') {
      await this.prisma.subscription.upsert({
        where:  { userId },
        create: {
          userId,
          plan:                 dto.plan as SubscriptionPlan,
          status:               SubscriptionStatus.ACTIVE,
          stripeCustomerId:     customerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId:        planConfig.stripePriceId,
          currentPeriodStart:   periodStart,
          currentPeriodEnd:     periodEnd,
          cancelAtPeriodEnd:    false,
          isCoachPremium:       isCoach,
          maxClients:           isCoach ? 999 : 0,
        },
        update: {
          plan:                 dto.plan as SubscriptionPlan,
          status:               SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: subscription.id,
          stripePriceId:        planConfig.stripePriceId,
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

      this.logger.log(`[IAP] ✅ Subscribed user=${userId} plan=${dto.plan} sub=${subscription.id}`);
    }

    const statusMessages: Record<string, string> = {
      active:           `${dto.plan} subscription activated! You now have premium access.`,
      trialing:         `${dto.plan} trial started! Enjoy your premium features.`,
      requires_action:  'Payment requires 3D Secure verification. Please complete the authentication step.',
      incomplete:       'Payment is processing. Please complete the payment if prompted.',
    };

    return {
      subscriptionId:   subscription.id,
      status:           subStatus,
      clientSecret,
      plan:             planConfig.name,
      currentPeriodEnd: periodEnd,
      message:          statusMessages[subStatus] ?? `Subscription status: ${subStatus}`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Confirm Payment (only for 3D Secure)
  // ══════════════════════════════════════════════════════════════════════════

  async confirmMobilePayment(
    userId:         string,
    subscriptionId: string,
  ): Promise<ConfirmPaymentResult> {
    let subscription: Stripe.Subscription;
    try {
      subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as unknown as Stripe.Subscription;
    } catch {
      throw new NotFoundException('Subscription not found on Stripe.');
    }

    if (subscription.metadata?.userId !== userId) {
      throw new BadRequestException('Subscription does not belong to this account.');
    }

    const sub_any   = subscription as any;
    const periodEnd = sub_any.current_period_end
      ? new Date(sub_any.current_period_end * 1000) : null;
    const isActive  = subscription.status === 'active';

    if (isActive) {
      await this.prisma.subscription.updateMany({
        where: { userId },
        data:  {
          status:           SubscriptionStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      });
      await this.prisma.user.update({
        where: { id: userId },
        data:  { isPremium: true, premiumUntil: periodEnd },
      });
    }

    return {
      success: isActive,
      status:  subscription.status,
      message: isActive
        ? 'Payment confirmed. Your subscription is now active!'
        : `Payment status: ${subscription.status}. Please contact support if this persists.`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAYMENT METHODS
  // ══════════════════════════════════════════════════════════════════════════

  async getPaymentMethods(userId: string): Promise<PaymentMethodsResult> {
    const sub = await this.prisma.subscription.findUnique({
      where:  { userId },
      select: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId) {
      return { paymentMethods: [], defaultPaymentMethodId: null };
    }

    const [methods, customer] = await Promise.all([
      this.stripe.paymentMethods.list({ customer: sub.stripeCustomerId, type: 'card' }),
      this.stripe.customers.retrieve(sub.stripeCustomerId) as Promise<Stripe.Customer>,
    ]);

    const defaultId = (customer as any).invoice_settings?.default_payment_method ?? null;

    return {
      paymentMethods: methods.data.map((pm) => ({
        id:        pm.id,
        brand:     pm.card?.brand     ?? 'unknown',
        last4:     pm.card?.last4     ?? '****',
        expMonth:  pm.card?.exp_month ?? 0,
        expYear:   pm.card?.exp_year  ?? 0,
        isDefault: pm.id === defaultId,
      })),
      defaultPaymentMethodId: typeof defaultId === 'string' ? defaultId : null,
    };
  }

  async setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<{ success: boolean }> {
    const sub = await this.prisma.subscription.findUnique({
      where:  { userId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true },
    });
    if (!sub?.stripeCustomerId) throw new BadRequestException('No Stripe customer found.');

    await this.stripe.customers.update(sub.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    if (sub.stripeSubscriptionId) {
      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }
    return { success: true };
  }

  async removePaymentMethod(userId: string, paymentMethodId: string): Promise<{ success: boolean }> {
    const sub = await this.prisma.subscription.findUnique({
      where:  { userId },
      select: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId) throw new BadRequestException('No Stripe customer found.');

    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== sub.stripeCustomerId) {
      throw new BadRequestException('Payment method does not belong to this account.');
    }
    await this.stripe.paymentMethods.detach(paymentMethodId);
    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CANCEL SUBSCRIPTION
  // ══════════════════════════════════════════════════════════════════════════

  async cancelSubscription(userId: string, dto: CancelSubscriptionDto): Promise<CancelResult> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!sub?.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription to cancel.');
    }
    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Your subscription is already cancelled.');
    }

    try {
      const atPeriodEnd = dto.atPeriodEnd !== false;

      if (atPeriodEnd) {
        const updated = await this.stripe.subscriptions.update(
          sub.stripeSubscriptionId,
          { cancel_at_period_end: true },
        ) as unknown as Stripe.Subscription;

        await this.prisma.subscription.update({
          where: { userId },
          data:  { cancelAtPeriodEnd: true },
        });

        const effectiveDate = new Date(((updated as any).current_period_end ?? 0) * 1000);
        return {
          message:       `Your subscription will be cancelled on ${effectiveDate.toLocaleDateString()}.`,
          effectiveDate,
        };
      } else {
        await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId);
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
        return { message: 'Subscription cancelled. Premium access revoked immediately.' };
      }
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Cancellation failed: ${msg}`);
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
  // WEB CHECKOUT (for web users — browser redirect flow)
  // ══════════════════════════════════════════════════════════════════════════

  async createCheckoutSession(userId: string, dto: CreateCheckoutSessionDto): Promise<CheckoutResult> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.subscription.findUnique({
      where: { userId }, select: { plan: true, status: true, stripeSubscriptionId: true },
    });
    if (
      existing?.plan !== SubscriptionPlan.FREE &&
      existing?.status === SubscriptionStatus.ACTIVE &&
      existing?.stripeSubscriptionId
    ) {
      throw new BadRequestException('You already have an active subscription.');
    }

    const nameFilter = dto.planFor === 'coach' ? 'Coach' : '';
    const planConfig = await this.prisma.subscriptionPlanConfig.findFirst({
      where: {
        isActive: true, plan: dto.plan as SubscriptionPlan,
        ...(nameFilter ? { name: { contains: nameFilter, mode: 'insensitive' as const } } : {}),
      },
    });
    if (!planConfig)             throw new NotFoundException(`No plan config for plan="${dto.plan}".`);
    if (!planConfig.stripePriceId) throw new BadRequestException(`Plan "${planConfig.name}" has no Stripe Price ID.`);

    const customerId = await this.getOrCreateStripeCustomer(user);
    const appUrl     = this.config.get<string>('APP_BASE_URL') ?? 'https://app.husss.com';

    try {
      const session = await this.stripe.checkout.sessions.create({
        customer:   customerId,
        mode:       'subscription',
        line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
        success_url: dto.successUrl ?? `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  dto.cancelUrl  ?? `${appUrl}/payment/cancel`,
        metadata:   { userId, plan: dto.plan, planFor: dto.planFor },
        subscription_data: { metadata: { userId, plan: dto.plan, planFor: dto.planFor } },
        allow_promotion_codes: true,
      });
      return { sessionId: session.id, url: session.url!, planName: planConfig.name, amount: planConfig.priceUSD };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Checkout session failed: ${msg}`);
    }
  }

  async createBillingPortalSession(userId: string): Promise<PortalResult> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId }, select: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId) throw new BadRequestException('No Stripe customer. Please subscribe first.');
    const appUrl = this.config.get<string>('APP_BASE_URL') ?? 'https://app.husss.com';
    const portal = await this.stripe.billingPortal.sessions.create({
      customer:   sub.stripeCustomerId,
      return_url: `${appUrl}/settings/subscription`,
    });
    return { url: portal.url };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STRIPE WEBHOOK
  // ══════════════════════════════════════════════════════════════════════════

  async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<WebhookResult> {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new BadRequestException('Webhook secret not configured.');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Webhook signature invalid: ${msg}`);
    }

    this.logger.log(`[Webhook] ${event.type} [${event.id}]`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session); break;
        case 'customer.subscription.updated':
          await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription); break;
        case 'customer.subscription.deleted':
          await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription); break;
        case 'invoice.payment_succeeded':
          await this.onInvoicePaymentSucceeded(event.data.object as Stripe.Invoice); break;
        case 'invoice.payment_failed':
          await this.onInvoicePaymentFailed(event.data.object as Stripe.Invoice); break;
        default:
          this.logger.debug(`[Webhook] Unhandled: ${event.type}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Webhook] Handler error [${event.type}]: ${msg}`);
    }

    return { received: true };
  }

  // ── Webhook Handlers ──────────────────────────────────────────────────────

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId  = session.metadata?.userId;
    const planStr = session.metadata?.plan;
    const planFor = session.metadata?.planFor;
    if (!userId || !planStr) return;

    const plan = planStr as SubscriptionPlan;
    if (!Object.values(SubscriptionPlan).includes(plan)) return;

    const stripeSubId = session.subscription as string;
    let stripeSub: Stripe.Subscription;
    try {
      stripeSub = await this.stripe.subscriptions.retrieve(stripeSubId) as unknown as Stripe.Subscription;
    } catch { return; }

    const isCoach    = planFor === 'coach';
    const sub_any    = stripeSub as any;
    const periodStart = new Date((sub_any.current_period_start ?? sub_any.billing_cycle_anchor ?? 0) * 1000);
    const periodEnd   = new Date((sub_any.current_period_end   ?? 0) * 1000);

    await this.prisma.subscription.upsert({
      where:  { userId },
      create: { userId, plan, status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: stripeSubId,
        stripePriceId: stripeSub.items.data[0]?.price?.id ?? null,
        currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false, isCoachPremium: isCoach, maxClients: isCoach ? 999 : 0 },
      update: { plan, status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: stripeSubId,
        stripePriceId: stripeSub.items.data[0]?.price?.id ?? null,
        currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false, isCoachPremium: isCoach, maxClients: isCoach ? 999 : 0 },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data:  { isPremium: true, premiumUntil: periodEnd },
    });
    await this.prisma.notification.create({
      data: { userId, type: NotificationType.PREMIUM_EXPIRY,
        title: '🎉 Premium Activated!',
        body:  `Your ${plan} plan is now active. Enjoy all premium features!`,
        data:  { plan, periodEnd: periodEnd.toISOString() } as any },
    });
    this.logger.log(`[Webhook] ✅ Checkout completed user=${userId} plan=${plan}`);
  }

  private async onSubscriptionUpdated(stripeSub: Stripe.Subscription) {
    const userId = stripeSub.metadata?.userId;
    if (!userId) return;
    const sub_any = stripeSub as any;
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data:  {
        status:             this.mapStripeStatus(stripeSub.status),
        currentPeriodStart: new Date((sub_any.current_period_start ?? 0) * 1000),
        currentPeriodEnd:   new Date((sub_any.current_period_end   ?? 0) * 1000),
        cancelAtPeriodEnd:  stripeSub.cancel_at_period_end,
      },
    });
  }

  private async onSubscriptionDeleted(stripeSub: Stripe.Subscription) {
    const userId = stripeSub.metadata?.userId;
    if (!userId) return;
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data:  { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date(), plan: SubscriptionPlan.FREE },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { isPremium: false, premiumUntil: null } });
    await this.prisma.notification.create({
      data: { userId, type: NotificationType.PREMIUM_EXPIRY,
        title: 'Subscription Ended',
        body:  'Your premium subscription has ended.',
        data:  {} as any },
    });
  }

  private async onInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const inv  = invoice as any;
    const subId: string | null = typeof inv.subscription === 'string'
      ? inv.subscription : inv.subscription?.id ?? null;
    if (!subId) return;

    let userId: string | undefined;
    try {
      const s = await this.stripe.subscriptions.retrieve(subId) as unknown as Stripe.Subscription;
      userId  = s.metadata?.userId;
    } catch { return; }
    if (!userId) return;

    const sub = await this.prisma.subscription.findUnique({ where: { userId }, select: { plan: true } });
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          userId,
          stripePaymentId: typeof inv.payment_intent === 'string' ? inv.payment_intent : (inv.payment_intent as any)?.id ?? null,
          stripeInvoiceId: invoice.id,
          plan:            sub?.plan ?? SubscriptionPlan.MONTHLY,
          amount:          invoice.amount_paid / 100,
          currency:        invoice.currency.toUpperCase(),
          status:          PaymentStatus.SUCCEEDED,
          description:     `Subscription payment — ${invoice.number ?? invoice.id}`,
        },
      });
    } catch (err: unknown) {
      if ((err as any)?.code !== 'P2002') this.logger.error('[Webhook] Failed to record payment');
    }
  }

  private async onInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const inv  = invoice as any;
    const subId: string | null = typeof inv.subscription === 'string'
      ? inv.subscription : inv.subscription?.id ?? null;
    if (!subId) return;

    let userId: string | undefined;
    try {
      const s = await this.stripe.subscriptions.retrieve(subId) as unknown as Stripe.Subscription;
      userId  = s.metadata?.userId;
    } catch { return; }
    if (!userId) return;

    const sub = await this.prisma.subscription.findUnique({ where: { userId }, select: { plan: true } });
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          userId,
          stripePaymentId: typeof inv.payment_intent === 'string' ? inv.payment_intent : (inv.payment_intent as any)?.id ?? null,
          stripeInvoiceId: invoice.id,
          plan:            sub?.plan ?? SubscriptionPlan.MONTHLY,
          amount:          invoice.amount_due / 100,
          currency:        invoice.currency.toUpperCase(),
          status:          PaymentStatus.FAILED,
          description:     `Failed payment — ${invoice.number ?? invoice.id}`,
          failureReason:   'Payment declined. Please update your payment method.',
        },
      });
    } catch (err: unknown) {
      if ((err as any)?.code !== 'P2002') this.logger.error('[Webhook] Failed to record failed payment');
    }
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subId },
      data:  { status: SubscriptionStatus.PAST_DUE },
    });
    await this.prisma.notification.create({
      data: { userId, type: NotificationType.PREMIUM_EXPIRY,
        title: '⚠️ Payment Failed',
        body:  'Your payment failed. Please update your payment method.',
        data:  { invoiceId: invoice.id } as any },
    });
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async getOrCreateStripeCustomer(
    user: { id: string; email: string; name?: string | null },
  ): Promise<string> {
    const existing = await this.prisma.subscription.findUnique({
      where:  { userId: user.id },
      select: { stripeCustomerId: true },
    });
    if (existing?.stripeCustomerId) return existing.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      email:    user.email,
      name:     user.name ?? undefined,
      metadata: { userId: user.id },
    });
    await this.prisma.subscription.upsert({
      where:  { userId: user.id },
      create: { userId: user.id, plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE, stripeCustomerId: customer.id },
      update: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  private mapStripeStatus(s: string): SubscriptionStatus {
    const m: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE, canceled: SubscriptionStatus.CANCELLED,
      past_due: SubscriptionStatus.PAST_DUE, trialing: SubscriptionStatus.TRIALING,
      unpaid: SubscriptionStatus.PAST_DUE, incomplete: SubscriptionStatus.PAST_DUE,
      incomplete_expired: SubscriptionStatus.EXPIRED, paused: SubscriptionStatus.CANCELLED,
    };
    return m[s] ?? SubscriptionStatus.ACTIVE;
  }
}