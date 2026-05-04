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
import {
  MobileSubscribeDto,
  CancelSubscriptionDto,
  CreateCheckoutSessionDto,
  CreateIntentDto,
} from './dto/stripe.dto';
import type {
  SubscriptionStatusResult,
  SetupIntentResult,
  MobileSubscribeResult,
  ConfirmPaymentResult,
  PaymentMethodsResult,
  CheckoutResult,
  PortalResult,
  CancelResult,
  WebhookResult,
  CreateIntentResult,
} from './type/stripe.type';
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
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) this.logger.error('STRIPE_SECRET_KEY is not configured!');
    this.stripe = new Stripe(key ?? '', { apiVersion: '2026-02-25.clover' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLANS (public)
  // ══════════════════════════════════════════════════════════════════════════

  async getSubscriptionPlans(): Promise<any[]> {
    return this.prisma.subscriptionPlanConfig.findMany({
      where: { isActive: true },
      orderBy: { priceUSD: 'asc' },
    });
  }

  async getPlansGrouped(): Promise<{ userPlans: any[]; coachPlans: any[] }> {
    const all = await this.prisma.subscriptionPlanConfig.findMany({
      where: { isActive: true },
      orderBy: { priceUSD: 'asc' },
    });
    return {
      userPlans: all.filter((p) => !p.name.toLowerCase().includes('coach')),
      coachPlans: all.filter((p) => p.name.toLowerCase().includes('coach')),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — CREATE INTENT (Flutter Payment Sheet)
  //
  // Flow:
  //   createIntent → clientSecret → Flutter Payment Sheet → payment_intent.succeeded
  //   → onPaymentIntentSucceeded → create subscription with trial_end trick
  //   → invoice.payment_succeeded (renewals) → onInvoicePaymentSucceeded
  //
  // WHY PaymentIntent instead of Subscription:
  //   Subscription-first approach causes invoice to have no PaymentIntent
  //   immediately (async Stripe delay), so client_secret comes back null.
  //   Creating a PaymentIntent directly always gives a client_secret instantly.
  // ══════════════════════════════════════════════════════════════════════════

  async createIntent(
    userId: string,
    dto: CreateIntentDto,
  ): Promise<CreateIntentResult> {
    // 1. Get user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // 2. Block already active subscription
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true, stripeSubscriptionId: true },
    });
    if (
      existing?.plan !== SubscriptionPlan.FREE &&
      existing?.status === SubscriptionStatus.ACTIVE &&
      existing?.stripeSubscriptionId
    ) {
      throw new BadRequestException(
        'You already have an active subscription. Cancel it first.',
      );
    }

    // 3. Resolve Price ID from DB (with ENV fallback)
    const stripePriceId = await this.getStripePriceId(dto);

    // 4. Fetch amount from Stripe (source of truth — never hardcode)
    let amount = 0;
    try {
      const stripePrice = await this.stripe.prices.retrieve(stripePriceId);
      amount = stripePrice.unit_amount ?? 0;
      this.logger.log(
        `[IAP] Price ${stripePriceId} → amount=${amount} ` +
          `recurring=${stripePrice.recurring?.interval ?? 'none'}`,
      );
    } catch (err) {
      throw new BadRequestException(
        `Could not retrieve price from Stripe: ${err}. ` +
          `Check that price ID "${stripePriceId}" exists in your Stripe account.`,
      );
    }

    if (amount <= 0) {
      throw new BadRequestException(
        `Price amount is ${amount}. Must be > 0. ` +
          `Check your Stripe product price for ID "${stripePriceId}".`,
      );
    }

    // 5. Get or create Stripe customer
    const customerId = await this.getOrCreateStripeCustomer(user);

    // 6. Ephemeral key (Flutter SDK needs this to display Payment Sheet UI)
    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2026-02-25.clover' },
    );

    // 7. Create PaymentIntent — always returns client_secret immediately
    //    setup_future_usage: 'off_session' → saves card for recurring billing
    //    The webhook payment_intent.succeeded will create the subscription
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customerId,
      setup_future_usage: 'off_session',
      payment_method_types: ['card'],
      metadata: {
        userId,
        plan: dto.plan,
        planFor: dto.planFor ?? 'user',
        stripePriceId, // webhook uses this to create the subscription
      },
    });

    this.logger.log(
      `[IAP] ✅ PaymentIntent created: ${paymentIntent.id} ` +
        `amount=${amount} status=${paymentIntent.status}`,
    );

    // 8. Get plan config for display
    const planConfig = await this.prisma.subscriptionPlanConfig.findFirst({
      where: { plan: dto.plan as SubscriptionPlan, isActive: true },
      select: { id: true, name: true, priceUSD: true },
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      customerId,
      ephemeralKey: ephemeralKey.secret!,
      publishableKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '',
      amount,
      currency: 'usd',
      planName: planConfig?.name ?? `${dto.plan} Premium`,
      planId: planConfig?.id ?? '',
      priceUSD: planConfig?.priceUSD ?? 0,
      subscriptionId: '', // created by webhook after payment
      requiresPayment: true,
      status: 'requires_payment_method',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTION STATUS
  // ══════════════════════════════════════════════════════════════════════════

  async getCurrentSubscription(
    userId: string,
  ): Promise<SubscriptionStatusResult> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!sub) {
      return {
        plan: 'FREE',
        status: 'ACTIVE',
        isPremium: false,
        isCoachPremium: false,
        maxClients: 0,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        stripeStatus: null,
      };
    }

    // Sync live status from Stripe
    let stripeStatus: string | null = null;
    if (sub.stripeSubscriptionId) {
      try {
        const s = await this.stripe.subscriptions.retrieve(
          sub.stripeSubscriptionId,
        );
        stripeStatus = s.status;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Stripe retrieve failed for ${sub.stripeSubscriptionId}: ${msg}`,
        );
      }
    }

    return {
      plan: sub.plan,
      status: sub.status,
      isPremium:
        sub.plan !== SubscriptionPlan.FREE &&
        sub.status === SubscriptionStatus.ACTIVE,
      isCoachPremium: sub.isCoachPremium,
      maxClients: sub.maxClients,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      trialEnd: sub.trialEnd,
      stripeStatus,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SETUP INTENT (3-step flow — alternative to Payment Sheet)
  // ══════════════════════════════════════════════════════════════════════════

  async createSetupIntent(userId: string): Promise<SetupIntentResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const customerId = await this.getOrCreateStripeCustomer(user);

    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2026-02-25.clover' },
    );

    const setupIntent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { userId },
    });

    this.logger.log(
      `[IAP] SetupIntent created — user=${userId} customer=${customerId}`,
    );

    return {
      customerId,
      setupIntentClientSecret: setupIntent.client_secret!,
      ephemeralKey: ephemeralKey.secret!,
      publishableKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE SUBSCRIBE (3-step flow Step 2 — uses saved payment method)
  // ══════════════════════════════════════════════════════════════════════════

  async createMobileSubscription(
    userId: string,
    dto: MobileSubscribeDto,
  ): Promise<MobileSubscribeResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
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

    const nameFilter = dto.planFor === 'coach' ? 'Coach' : '';
    const planConfig = await this.prisma.subscriptionPlanConfig.findFirst({
      where: {
        isActive: true,
        plan: dto.plan as SubscriptionPlan,
        ...(nameFilter
          ? { name: { contains: nameFilter, mode: 'insensitive' as const } }
          : {}),
      },
    });
    if (!planConfig)
      throw new NotFoundException(
        `No plan config for plan="${dto.plan}" planFor="${dto.planFor}".`,
      );
    if (!planConfig.stripePriceId)
      throw new BadRequestException(
        `Plan "${planConfig.name}" has no Stripe Price ID.`,
      );

    const customerId = await this.getOrCreateStripeCustomer(user);

    // Attach payment method
    try {
      await this.stripe.paymentMethods.attach(dto.paymentMethodId, {
        customer: customerId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already been attached'))
        throw new BadRequestException(`Payment method error: ${msg}`);
    }

    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: dto.paymentMethodId },
    });

    let subscription: Stripe.Subscription;
    try {
      subscription = (await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: planConfig.stripePriceId }],
        default_payment_method: dto.paymentMethodId,
        expand: ['latest_invoice.payment_intent'],
        metadata: { userId, plan: dto.plan, planFor: dto.planFor },
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
      })) as unknown as Stripe.Subscription;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Subscription failed: ${msg}`);
    }

    const latestInvoice = (subscription as any).latest_invoice as any;
    const paymentIntent =
      latestInvoice?.payment_intent as Stripe.PaymentIntent | null;
    const clientSecret = paymentIntent?.client_secret ?? null;
    const sub_any = subscription as any;
    const periodEnd = sub_any.current_period_end
      ? new Date(sub_any.current_period_end * 1000)
      : null;
    const periodStart = sub_any.current_period_start
      ? new Date(sub_any.current_period_start * 1000)
      : new Date();
    const isCoach = dto.planFor === 'coach';
    const subStatus = subscription.status;

    if (subStatus === 'active' || subStatus === 'trialing') {
      await this.prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: dto.plan as SubscriptionPlan,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: planConfig.stripePriceId,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          isCoachPremium: isCoach,
          maxClients: isCoach ? 999 : 0,
        },
        update: {
          plan: dto.plan as SubscriptionPlan,
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: subscription.id,
          stripePriceId: planConfig.stripePriceId,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          isCoachPremium: isCoach,
          maxClients: isCoach ? 999 : 0,
        },
      });
      await this.prisma.user.update({
        where: { id: userId },
        data: { isPremium: true, premiumUntil: periodEnd },
      });
    }

    const statusMessages: Record<string, string> = {
      active: `${dto.plan} subscription activated!`,
      trialing: `${dto.plan} trial started!`,
      requires_action:
        'Payment requires 3D Secure verification.',
      incomplete: 'Payment is processing.',
    };

    return {
      subscriptionId: subscription.id,
      status: subStatus,
      clientSecret,
      plan: planConfig.name,
      currentPeriodEnd: periodEnd,
      message: statusMessages[subStatus] ?? `Status: ${subStatus}`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIRM PAYMENT (3D Secure)
  // ══════════════════════════════════════════════════════════════════════════

  async confirmMobilePayment(
    userId: string,
    subscriptionId: string,
  ): Promise<ConfirmPaymentResult> {
    let subscription: Stripe.Subscription;
    try {
      subscription = (await this.stripe.subscriptions.retrieve(
        subscriptionId,
      )) as unknown as Stripe.Subscription;
    } catch {
      throw new NotFoundException('Subscription not found on Stripe.');
    }

    if (subscription.metadata?.userId !== userId) {
      throw new BadRequestException(
        'Subscription does not belong to this account.',
      );
    }

    const sub_any = subscription as any;
    const periodEnd = sub_any.current_period_end
      ? new Date(sub_any.current_period_end * 1000)
      : null;
    const isActive = subscription.status === 'active';

    if (isActive) {
      await this.prisma.subscription.updateMany({
        where: { userId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      });
      await this.prisma.user.update({
        where: { id: userId },
        data: { isPremium: true, premiumUntil: periodEnd },
      });
    }

    return {
      success: isActive,
      status: subscription.status,
      message: isActive
        ? 'Payment confirmed. Your subscription is now active!'
        : `Payment status: ${subscription.status}.`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAYMENT METHODS
  // ══════════════════════════════════════════════════════════════════════════

  async getPaymentMethods(userId: string): Promise<PaymentMethodsResult> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId)
      return { paymentMethods: [], defaultPaymentMethodId: null };

    const [methods, customer] = await Promise.all([
      this.stripe.paymentMethods.list({
        customer: sub.stripeCustomerId,
        type: 'card',
      }),
      this.stripe.customers.retrieve(
        sub.stripeCustomerId,
      ) as Promise<Stripe.Customer>,
    ]);

    const defaultId =
      (customer as any).invoice_settings?.default_payment_method ?? null;

    return {
      paymentMethods: methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? 'unknown',
        last4: pm.card?.last4 ?? '****',
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
        isDefault: pm.id === defaultId,
      })),
      defaultPaymentMethodId:
        typeof defaultId === 'string' ? defaultId : null,
    };
  }

  async setDefaultPaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<{ success: boolean }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true },
    });
    if (!sub?.stripeCustomerId)
      throw new BadRequestException('No Stripe customer found.');

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

  async removePaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<{ success: boolean }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId)
      throw new BadRequestException('No Stripe customer found.');

    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== sub.stripeCustomerId)
      throw new BadRequestException(
        'Payment method does not belong to this account.',
      );

    await this.stripe.paymentMethods.detach(paymentMethodId);
    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CANCEL SUBSCRIPTION
  // ══════════════════════════════════════════════════════════════════════════

  async cancelSubscription(
    userId: string,
    dto: CancelSubscriptionDto,
  ): Promise<CancelResult> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!sub?.stripeSubscriptionId)
      throw new BadRequestException('No active Stripe subscription to cancel.');
    if (sub.status === SubscriptionStatus.CANCELLED)
      throw new BadRequestException('Subscription is already cancelled.');

    try {
      const atPeriodEnd = dto.atPeriodEnd !== false;

      if (atPeriodEnd) {
        const updated = (await this.stripe.subscriptions.update(
          sub.stripeSubscriptionId,
          { cancel_at_period_end: true },
        )) as unknown as Stripe.Subscription;

        await this.prisma.subscription.update({
          where: { userId },
          data: { cancelAtPeriodEnd: true },
        });

        const effectiveDate = new Date(
          ((updated as any).current_period_end ?? 0) * 1000,
        );
        return {
          message: `Subscription will cancel on ${effectiveDate.toLocaleDateString()}.`,
          effectiveDate,
        };
      } else {
        await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        await this.prisma.subscription.update({
          where: { userId },
          data: {
            status: SubscriptionStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelAtPeriodEnd: false,
            plan: SubscriptionPlan.FREE,
          },
        });
        await this.prisma.user.update({
          where: { id: userId },
          data: { isPremium: false, premiumUntil: null },
        });
        return {
          message: 'Subscription cancelled. Premium access revoked immediately.',
        };
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
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WEB CHECKOUT
  // ══════════════════════════════════════════════════════════════════════════

  async createCheckoutSession(
    userId: string,
    dto: CreateCheckoutSessionDto,
  ): Promise<CheckoutResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true, stripeSubscriptionId: true },
    });
    if (
      existing?.plan !== SubscriptionPlan.FREE &&
      existing?.status === SubscriptionStatus.ACTIVE &&
      existing?.stripeSubscriptionId
    )
      throw new BadRequestException('You already have an active subscription.');

    const nameFilter = dto.planFor === 'coach' ? 'Coach' : '';
    const planConfig = await this.prisma.subscriptionPlanConfig.findFirst({
      where: {
        isActive: true,
        plan: dto.plan as SubscriptionPlan,
        ...(nameFilter
          ? { name: { contains: nameFilter, mode: 'insensitive' as const } }
          : {}),
      },
    });
    if (!planConfig)
      throw new NotFoundException(`No plan config for plan="${dto.plan}".`);
    if (!planConfig.stripePriceId)
      throw new BadRequestException(
        `Plan "${planConfig.name}" has no Stripe Price ID.`,
      );

    const customerId = await this.getOrCreateStripeCustomer(user);
    const appUrl =
      this.config.get<string>('APP_BASE_URL') ?? 'https://app.husss.com';

    try {
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
        success_url:
          dto.successUrl ??
          `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: dto.cancelUrl ?? `${appUrl}/payment/cancel`,
        metadata: { userId, plan: dto.plan, planFor: dto.planFor },
        subscription_data: {
          metadata: { userId, plan: dto.plan, planFor: dto.planFor },
        },
        allow_promotion_codes: true,
      });
      return {
        sessionId: session.id,
        url: session.url!,
        planName: planConfig.name,
        amount: planConfig.priceUSD,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Checkout session failed: ${msg}`);
    }
  }

  async createBillingPortalSession(userId: string): Promise<PortalResult> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId)
      throw new BadRequestException(
        'No Stripe customer. Please subscribe first.',
      );

    const appUrl =
      this.config.get<string>('APP_BASE_URL') ?? 'https://app.husss.com';
    const portal = await this.stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/settings/subscription`,
    });
    return { url: portal.url };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STRIPE WEBHOOK
  // ══════════════════════════════════════════════════════════════════════════

  async handleStripeWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<WebhookResult> {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret)
      throw new BadRequestException('Webhook secret not configured.');

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
        // ── Flutter Payment Sheet flow (PaymentIntent-first) ──────────────
        case 'payment_intent.succeeded':
          await this.onPaymentIntentSucceeded(
            event.data.object as Stripe.PaymentIntent,
          );
          break;

        // ── Web Checkout flow ─────────────────────────────────────────────
        case 'checkout.session.completed':
          await this.onCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session,
          );
          break;

        // ── Subscription lifecycle (renewals, cancellations) ──────────────
        case 'customer.subscription.updated':
          await this.onSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
          );
          break;
        case 'customer.subscription.deleted':
          await this.onSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
          );
          break;

        // ── Invoice events (renewals only — NOT the first payment) ────────
        case 'invoice.payment_succeeded':
          await this.onInvoicePaymentSucceeded(
            event.data.object as Stripe.Invoice,
          );
          break;
        case 'invoice.payment_failed':
          await this.onInvoicePaymentFailed(
            event.data.object as Stripe.Invoice,
          );
          break;

        default:
          this.logger.debug(`[Webhook] Unhandled: ${event.type}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Webhook] Handler error [${event.type}]: ${msg}`);
    }

    return { received: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WEBHOOK HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Fired when Flutter Payment Sheet completes successfully.
   *
   * CRITICAL: We create the subscription with trial_end = now + billing period.
   * This means:
   *   - Stripe creates the subscription
   *   - First billing period starts immediately
   *   - But Stripe does NOT charge again right now (user already paid via PI)
   *   - Next charge happens after 1 month/year when trial_end expires
   *
   * This is the correct way to avoid double-charging.
   */
  private async onPaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
    const userId = pi.metadata?.userId;
    const planStr = pi.metadata?.plan;
    const planFor = pi.metadata?.planFor ?? 'user';
    const stripePriceId = pi.metadata?.stripePriceId;

    // Only handle PIs that came from our create-intent endpoint
    if (!userId || !planStr || !stripePriceId) {
      this.logger.debug(
        `[Webhook] payment_intent.succeeded skipped — ` +
          `no userId/plan/stripePriceId in metadata (PI=${pi.id})`,
      );
      return;
    }

    // Skip if user already has an active subscription (idempotency guard)
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true, stripeSubscriptionId: true },
    });
    if (
      existing?.plan !== SubscriptionPlan.FREE &&
      existing?.status === SubscriptionStatus.ACTIVE &&
      existing?.stripeSubscriptionId
    ) {
      this.logger.log(
        `[Webhook] payment_intent.succeeded — user=${userId} already active, skipping`,
      );
      return;
    }

    const plan = planStr as SubscriptionPlan;
    this.logger.log(
      `[Webhook] payment_intent.succeeded → creating subscription ` +
        `user=${userId} plan=${plan} PI=${pi.id}`,
    );

    const paymentMethodId =
      typeof pi.payment_method === 'string'
        ? pi.payment_method
        : (pi.payment_method as any)?.id ?? null;

    const customerId =
      typeof pi.customer === 'string'
        ? pi.customer
        : (pi.customer as any)?.id ?? null;

    if (!paymentMethodId || !customerId) {
      this.logger.error(
        `[Webhook] Missing paymentMethod or customer on PI ${pi.id}`,
      );
      return;
    }

    // Set card as default for future renewals
    await this.stripe.customers
      .update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      })
      .catch((e) =>
        this.logger.warn(`[Webhook] Could not set default PM: ${e}`),
      );

    // Determine billing period to set trial_end
    // trial_end = now + 1 billing cycle (so next charge is 1 month/year from now)
    const stripePrice = await this.stripe.prices
      .retrieve(stripePriceId)
      .catch(() => null);
    const intervalDays =
      stripePrice?.recurring?.interval === 'year' ? 365 : 30;
    const trialEnd = Math.floor(Date.now() / 1000) + intervalDays * 24 * 3600;

    // Create subscription — trial_end prevents Stripe from charging immediately
    // User already paid via the PaymentIntent above
    let subscription: Stripe.Subscription;
    try {
      subscription = (await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: stripePriceId }],
        default_payment_method: paymentMethodId,
        trial_end: trialEnd, // ← KEY: skip first invoice (already paid via PI)
        metadata: { userId, plan: planStr, planFor },
      })) as unknown as Stripe.Subscription;
    } catch (err) {
      this.logger.error(
        `[Webhook] Subscription creation failed after PI: ${err}`,
      );
      return;
    }

    const sub_any = subscription as any;
    const periodEnd = new Date(trialEnd * 1000); // = trial_end = next billing date
    const periodStart = new Date();
    const isCoach = planFor === 'coach';

    // Save subscription to DB
    await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        isCoachPremium: isCoach,
        maxClients: isCoach ? 999 : 0,
      },
      update: {
        plan,
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: subscription.id,
        stripePriceId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        isCoachPremium: isCoach,
        maxClients: isCoach ? 999 : 0,
      },
    });

    // Activate premium on user
    await this.prisma.user.update({
      where: { id: userId },
      data: { isPremium: true, premiumUntil: periodEnd },
    });

    // Record first payment transaction
    await this.prisma.paymentTransaction
      .create({
        data: {
          userId,
          stripePaymentId: pi.id,
          plan,
          amount: pi.amount / 100,
          currency: pi.currency.toUpperCase(),
          status: PaymentStatus.SUCCEEDED,
          description: `${plan} subscription — first payment`,
        },
      })
      .catch(() => {}); // ignore P2002 duplicate

    // Send notification
    await this.prisma.notification
      .create({
        data: {
          userId,
          type: NotificationType.PREMIUM_EXPIRY,
          title: '🎉 Premium Activated!',
          body: `Your ${plan} plan is now active. Next billing: ${periodEnd.toLocaleDateString()}.`,
          data: { plan, periodEnd: periodEnd.toISOString() } as any,
        },
      })
      .catch(() => {});

    this.logger.log(
      `[Webhook] ✅ Subscription created: user=${userId} ` +
        `sub=${subscription.id} nextBilling=${periodEnd.toLocaleDateString()}`,
    );
  }

  /**
   * Fired when web Checkout Session completes.
   * No double-charge risk here — Stripe handles it natively.
   */
  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const planStr = session.metadata?.plan;
    const planFor = session.metadata?.planFor;
    if (!userId || !planStr) return;

    const plan = planStr as SubscriptionPlan;
    if (!Object.values(SubscriptionPlan).includes(plan)) return;

    const stripeSubId = session.subscription as string;
    let stripeSub: Stripe.Subscription;
    try {
      stripeSub = (await this.stripe.subscriptions.retrieve(
        stripeSubId,
      )) as unknown as Stripe.Subscription;
    } catch {
      return;
    }

    const isCoach = planFor === 'coach';
    const sub_any = stripeSub as any;
    const periodStart = new Date(
      (sub_any.current_period_start ?? sub_any.billing_cycle_anchor ?? 0) *
        1000,
    );
    const periodEnd = new Date((sub_any.current_period_end ?? 0) * 1000);

    await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: stripeSubId,
        stripePriceId: stripeSub.items.data[0]?.price?.id ?? null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        isCoachPremium: isCoach,
        maxClients: isCoach ? 999 : 0,
      },
      update: {
        plan,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: stripeSubId,
        stripePriceId: stripeSub.items.data[0]?.price?.id ?? null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        isCoachPremium: isCoach,
        maxClients: isCoach ? 999 : 0,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { isPremium: true, premiumUntil: periodEnd },
    });

    await this.prisma.notification
      .create({
        data: {
          userId,
          type: NotificationType.PREMIUM_EXPIRY,
          title: '🎉 Premium Activated!',
          body: `Your ${plan} plan is now active. Enjoy all premium features!`,
          data: { plan, periodEnd: periodEnd.toISOString() } as any,
        },
      })
      .catch(() => {});

    this.logger.log(
      `[Webhook] ✅ Checkout completed user=${userId} plan=${plan}`,
    );
  }

  /**
   * Fired on subscription changes (plan upgrade, cancel_at_period_end, etc.)
   */
  private async onSubscriptionUpdated(stripeSub: Stripe.Subscription) {
    const userId = stripeSub.metadata?.userId;
    if (!userId) return;

    const sub_any = stripeSub as any;
    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data: {
        status: this.mapStripeStatus(stripeSub.status),
        currentPeriodStart: new Date(
          (sub_any.current_period_start ?? 0) * 1000,
        ),
        currentPeriodEnd: new Date((sub_any.current_period_end ?? 0) * 1000),
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    });

    this.logger.log(
      `[Webhook] Subscription updated: ${stripeSub.id} status=${stripeSub.status}`,
    );
  }

  /**
   * Fired when subscription is fully deleted (after cancellation period ends).
   */
  private async onSubscriptionDeleted(stripeSub: Stripe.Subscription) {
    const userId = stripeSub.metadata?.userId;
    if (!userId) return;

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt: new Date(),
        plan: SubscriptionPlan.FREE,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { isPremium: false, premiumUntil: null },
    });
    await this.prisma.notification
      .create({
        data: {
          userId,
          type: NotificationType.PREMIUM_EXPIRY,
          title: 'Subscription Ended',
          body: 'Your premium subscription has ended.',
          data: {} as any,
        },
      })
      .catch(() => {});

    this.logger.log(`[Webhook] Subscription deleted: ${stripeSub.id}`);
  }

  /**
   * Fired for RENEWAL payments (month 2, 3, 4... or year 2, 3...).
   *
   * NOT fired for the very first payment (that was the PaymentIntent).
   * We guard against the first invoice with billing_reason check.
   */
  private async onInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const inv = invoice as any;

    // Skip the first invoice created when subscription starts
    // billing_reason='subscription_create' = first invoice (user already paid via PI)
    if (inv.billing_reason === 'subscription_create') {
      this.logger.log(
        `[Webhook] invoice.payment_succeeded skipped — ` +
          `billing_reason=subscription_create (first invoice, already paid via PI)`,
      );
      return;
    }

    const subId: string | null =
      typeof inv.subscription === 'string'
        ? inv.subscription
        : inv.subscription?.id ?? null;
    if (!subId) return;

    // Get userId from subscription metadata
    let userId: string | undefined;
    try {
      const s = (await this.stripe.subscriptions.retrieve(
        subId,
      )) as unknown as Stripe.Subscription;
      userId = s.metadata?.userId;

      // Update subscription period dates on renewal
      const s_any = s as any;
      await this.prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(
            (s_any.current_period_start ?? 0) * 1000,
          ),
          currentPeriodEnd: new Date((s_any.current_period_end ?? 0) * 1000),
        },
      });

      if (userId) {
        const periodEnd = s_any.current_period_end
          ? new Date(s_any.current_period_end * 1000)
          : null;
        await this.prisma.user.update({
          where: { id: userId },
          data: { isPremium: true, premiumUntil: periodEnd },
        });
      }
    } catch {
      return;
    }

    if (!userId) return;

    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true },
    });

    // Record renewal transaction
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          userId,
          stripePaymentId:
            typeof inv.payment_intent === 'string'
              ? inv.payment_intent
              : (inv.payment_intent as any)?.id ?? null,
          stripeInvoiceId: invoice.id,
          plan: sub?.plan ?? SubscriptionPlan.MONTHLY,
          amount: invoice.amount_paid / 100,
          currency: invoice.currency.toUpperCase(),
          status: PaymentStatus.SUCCEEDED,
          description: `Renewal payment — ${invoice.number ?? invoice.id}`,
        },
      });
    } catch (err: unknown) {
      if ((err as any)?.code !== 'P2002')
        this.logger.error('[Webhook] Failed to record renewal payment');
    }

    this.logger.log(
      `[Webhook] ✅ Renewal payment recorded: user=${userId} ` +
        `amount=${invoice.amount_paid / 100} invoice=${invoice.id}`,
    );
  }

  /**
   * Fired when a renewal payment fails.
   */
  private async onInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const inv = invoice as any;
    const subId: string | null =
      typeof inv.subscription === 'string'
        ? inv.subscription
        : inv.subscription?.id ?? null;
    if (!subId) return;

    let userId: string | undefined;
    try {
      const s = (await this.stripe.subscriptions.retrieve(
        subId,
      )) as unknown as Stripe.Subscription;
      userId = s.metadata?.userId;
    } catch {
      return;
    }
    if (!userId) return;

    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true },
    });

    try {
      await this.prisma.paymentTransaction.create({
        data: {
          userId,
          stripePaymentId:
            typeof inv.payment_intent === 'string'
              ? inv.payment_intent
              : (inv.payment_intent as any)?.id ?? null,
          stripeInvoiceId: invoice.id,
          plan: sub?.plan ?? SubscriptionPlan.MONTHLY,
          amount: invoice.amount_due / 100,
          currency: invoice.currency.toUpperCase(),
          status: PaymentStatus.FAILED,
          description: `Failed payment — ${invoice.number ?? invoice.id}`,
          failureReason: 'Payment declined. Please update your payment method.',
        },
      });
    } catch (err: unknown) {
      if ((err as any)?.code !== 'P2002')
        this.logger.error('[Webhook] Failed to record failed payment');
    }

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subId },
      data: { status: SubscriptionStatus.PAST_DUE },
    });

    await this.prisma.notification
      .create({
        data: {
          userId,
          type: NotificationType.PREMIUM_EXPIRY,
          title: '⚠️ Payment Failed',
          body: 'Your payment failed. Please update your payment method.',
          data: { invoiceId: invoice.id } as any,
        },
      })
      .catch(() => {});

    this.logger.log(
      `[Webhook] ❌ Payment failed: user=${userId} invoice=${invoice.id}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private async getStripePriceId(
    dto: CreateIntentDto | MobileSubscribeDto,
  ): Promise<string> {
    const planFor = (dto as any).planFor ?? 'user';
    const nameFilter = planFor === 'coach' ? 'Coach' : '';

    const planConfig = await this.prisma.subscriptionPlanConfig.findFirst({
      where: {
        isActive: true,
        plan: dto.plan as SubscriptionPlan,
        ...(nameFilter
          ? { name: { contains: nameFilter, mode: 'insensitive' as const } }
          : {}),
      },
    });

    if (planConfig?.stripePriceId) {
      this.logger.log(
        `Using DB price ID for ${dto.plan} (${planFor}): ${planConfig.stripePriceId}`,
      );
      return planConfig.stripePriceId;
    }

    // ENV fallback
    let priceId: string | undefined;
    if (dto.plan === SubscriptionPlan.MONTHLY)
      priceId = this.config.get<string>('STRIPE_MONTHLY_PRICE_ID');
    else if (dto.plan === SubscriptionPlan.ANNUAL)
      priceId = this.config.get<string>('STRIPE_ANNUAL_PRICE_ID');

    if (priceId) {
      this.logger.warn(
        `DB missing stripePriceId for ${dto.plan}. Using ENV fallback: ${priceId}`,
      );
      return priceId;
    }

    throw new BadRequestException(
      `No Stripe Price ID found for plan="${dto.plan}". ` +
        `Set it in subscriptionPlanConfig table or add STRIPE_MONTHLY_PRICE_ID in .env`,
    );
  }

  private async getOrCreateStripeCustomer(user: {
    id: string;
    email: string;
    name?: string | null;
  }): Promise<string> {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { stripeCustomerId: true },
    });
    if (existing?.stripeCustomerId) return existing.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    });

    await this.prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: customer.id,
      },
      update: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  private mapStripeStatus(s: string): SubscriptionStatus {
    const m: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      canceled: SubscriptionStatus.CANCELLED,
      past_due: SubscriptionStatus.PAST_DUE,
      trialing: SubscriptionStatus.TRIALING,
      unpaid: SubscriptionStatus.PAST_DUE,
      incomplete: SubscriptionStatus.PAST_DUE,
      incomplete_expired: SubscriptionStatus.EXPIRED,
      paused: SubscriptionStatus.CANCELLED,
    };
    return m[s] ?? SubscriptionStatus.ACTIVE;
  }
}