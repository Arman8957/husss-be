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

type InvoiceWithPaymentIntent = Stripe.Invoice & {
  payment_intent?: Stripe.PaymentIntent | string | null;
};
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
  // PUBLIC — Plans
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

    // Fallback to ENV vars (your current values)
    let priceId: string | undefined;
    if (dto.plan === SubscriptionPlan.MONTHLY) {
      priceId = this.config.get<string>('STRIPE_MONTHLY_PRICE_ID');
    } else if (dto.plan === SubscriptionPlan.ANNUAL) {
      priceId = this.config.get<string>('STRIPE_ANNUAL_PRICE_ID');
    }

    if (priceId) {
      this.logger.warn(
        `DB missing stripePriceId for ${dto.plan}. Using ENV fallback: ${priceId}`,
      );
      return priceId;
    }

    throw new BadRequestException(
      `No Stripe Price ID found for plan="${dto.plan}". ` +
        `Set it in subscriptionPlanConfig table or add STRIPE_MONTHLY_PRICE_ID / STRIPE_ANNUAL_PRICE_ID in .env`,
    );
  }

  // ====================== FINAL FIXED createIntent (Recurring Subscription) ======================
  // async createIntent(
  //   userId: string,
  //   dto: CreateIntentDto,
  // ): Promise<CreateIntentResult> {
  //   // 1. Get user
  //   const user = await this.prisma.user.findUnique({
  //     where: { id: userId },
  //     select: { id: true, email: true, name: true },
  //   });

  //   if (!user) throw new NotFoundException('User not found');

  //   // 2. Block if already has active paid subscription
  //   const existing = await this.prisma.subscription.findUnique({
  //     where: { userId },
  //     select: {
  //       plan: true,
  //       status: true,
  //       stripeSubscriptionId: true,
  //     },
  //   });

  //   if (
  //     existing?.plan !== SubscriptionPlan.FREE &&
  //     existing?.status === SubscriptionStatus.ACTIVE &&
  //     existing?.stripeSubscriptionId
  //   ) {
  //     throw new BadRequestException(
  //       'You already have an active subscription. Cancel it before subscribing to a new plan.',
  //     );
  //   }

  //   // 3. Get Stripe Price ID
  //   const stripePriceId = await this.getStripePriceId(dto);

  //   // 4. Get or create Stripe customer
  //   const customerId = await this.getOrCreateStripeCustomer(user);

  //   // 5. Create Ephemeral key
  //   const ephemeralKey = await this.stripe.ephemeralKeys.create(
  //     { customer: customerId },
  //     {
  //       apiVersion: '2026-02-25.clover',
  //     },
  //   );

  //   // 6. Create subscription
  //   let subscription: Stripe.Subscription;

  //   try {
  //     this.logger.log(
  //       `[IAP] Creating subscription with price: ${stripePriceId}`,
  //     );

  //     subscription = await this.stripe.subscriptions.create({
  //       customer: customerId,

  //       items: [{ price: stripePriceId }],

  //       payment_behavior: 'default_incomplete',

  //       payment_settings: {
  //         save_default_payment_method: 'on_subscription',

  //         payment_method_types: ['card'],
  //       },

  //       expand: [],

  //       metadata: {
  //         userId,
  //         plan: dto.plan,
  //         planFor: dto.planFor ?? 'user',
  //       },
  //     });
  //   } catch (err: unknown) {
  //     const msg = err instanceof Error ? err.message : String(err);

  //     this.logger.error(`[IAP] Subscription creation failed: ${msg}`);

  //     throw new BadRequestException(`Failed to create subscription: ${msg}`);
  //   }

  //   // 7. Get invoice ID
  //   const invoiceId =
  //     typeof subscription.latest_invoice === 'string'
  //       ? subscription.latest_invoice
  //       : ((subscription.latest_invoice as Stripe.Invoice | null)?.id ?? null);

  //   if (!invoiceId) {
  //     await this.stripe.subscriptions.cancel(subscription.id).catch(() => {});

  //     throw new InternalServerErrorException(
  //       'Subscription created but no invoice found. Please try again.',
  //     );
  //   }

  //   // 8. Retrieve invoice with PaymentIntent expanded

  //   let invoice: InvoiceWithPaymentIntent;

  //   try {
  //     invoice = await this.stripe.invoices.retrieve(invoiceId, {
  //       expand: ['payment_intent'],
  //     });
  //   } catch (err: unknown) {
  //     const msg = err instanceof Error ? err.message : String(err);

  //     await this.stripe.subscriptions.cancel(subscription.id).catch(() => {});

  //     throw new InternalServerErrorException(
  //       `Failed to retrieve invoice: ${msg}`,
  //     );
  //   }

  //   // Safe PaymentIntent extraction

  //   const paymentIntent =
  //     typeof invoice.payment_intent === 'object' &&
  //     invoice.payment_intent !== null
  //       ? invoice.payment_intent
  //       : null;

  //   const clientSecret = paymentIntent?.client_secret ?? null;

  //   this.logger.log(
  //     `[IAP] Invoice retrieved: id=${invoiceId} status=${invoice.status} ` +
  //       `piId=${paymentIntent?.id ?? 'none'} hasSecret=${!!clientSecret}`,
  //   );

  //   // Handle no payment case (trial / free)

  //   if (!clientSecret) {
  //     if (
  //       subscription.status === 'active' ||
  //       subscription.status === 'trialing'
  //     ) {
  //       this.logger.log(
  //         '[IAP] ✓ Subscription active immediately — no payment needed',
  //       );
  //     } else {
  //       await this.stripe.subscriptions.cancel(subscription.id).catch(() => {});

  //       throw new InternalServerErrorException(
  //         `No clientSecret on PaymentIntent. Invoice status: ${invoice.status}. ` +
  //           `Check your Stripe Price is recurring (not one-time).`,
  //       );
  //     }
  //   }

  //   // 9. Save to DB

  //   const planFor = dto.planFor ?? 'user';

  //   await this.prisma.subscription.upsert({
  //     where: { userId },

  //     create: {
  //       userId,

  //       plan: dto.plan as SubscriptionPlan,

  //       status: SubscriptionStatus.ACTIVE,

  //       stripeCustomerId: customerId,

  //       stripeSubscriptionId: subscription.id,

  //       stripePriceId,

  //       cancelAtPeriodEnd: false,

  //       isCoachPremium: planFor === 'coach',

  //       maxClients: planFor === 'coach' ? 999 : 0,
  //     },

  //     update: {
  //       stripeSubscriptionId: subscription.id,

  //       stripePriceId,
  //     },
  //   });

  //   // 10. Get plan config

  //   const planConfig = await this.prisma.subscriptionPlanConfig.findFirst({
  //     where: {
  //       plan: dto.plan as SubscriptionPlan,
  //       isActive: true,
  //     },

  //     select: {
  //       id: true,
  //       name: true,
  //       priceUSD: true,
  //     },
  //   });

  //   this.logger.log(
  //     `[IAP] ✅ create-intent SUCCESS → user=${userId} plan=${dto.plan} ` +
  //       `sub=${subscription.id} status=${subscription.status}`,
  //   );

  //   return {
  //     clientSecret: clientSecret ?? '',

  //     customerId,

  //     ephemeralKey: ephemeralKey.secret!,

  //     publishableKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '',

  //     amount: paymentIntent?.amount ?? invoice.amount_due ?? 0,

  //     currency: paymentIntent?.currency ?? invoice.currency ?? 'usd',

  //     planName: planConfig?.name ?? `${dto.plan} Premium`,

  //     planId: planConfig?.id ?? '',

  //     priceUSD: planConfig?.priceUSD ?? 0,

  //     subscriptionId: subscription.id,

  //     requiresPayment: !!clientSecret,

  //     status: subscription.status,
  //   };
  // }

  // ====================== FINAL IMPROVED createIntent ======================
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

    // 2. Block duplicate active subscriptions
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        plan: true,
        status: true,
        stripeSubscriptionId: true,
      },
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

    // 3. Get Stripe Price ID
    const stripePriceId = await this.getStripePriceId(dto);

    // 4. Validate price is recurring
    try {
      const price = await this.stripe.prices.retrieve(stripePriceId);
      this.logger.log(`Validating price ${stripePriceId}:`);
      this.logger.log(`  - Recurring: ${!!price.recurring}`);
      this.logger.log(`  - Active: ${price.active}`);
      this.logger.log(`  - Type: ${price.type}`);

      // if (!price.recurring) {
      //   throw new BadRequestException(
      //     `Price ID ${stripePriceId} is NOT a recurring price! ` +
      //       `Please check your Stripe Dashboard. Recurring prices have a billing period (Monthly/Yearly). ` +
      //       `Your price type is: ${price.type}.`,
      //   );
      // }

      if (!price.active) {
        throw new BadRequestException(
          `Price ID ${stripePriceId} is archived/inactive. Please activate it in Stripe Dashboard.`,
        );
      }

      // this.logger.log(
      //   `Price ${stripePriceId} is valid recurring price (${price.recurring.interval})`,
      // );
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Price validation failed: ${err.message}`);
      throw new BadRequestException(
        `Failed to validate Stripe price: ${err.message}. ` +
          `Please ensure you're using a valid recurring price ID.`,
      );
    }

    // 5. Get or create Stripe customer
    const customerId = await this.getOrCreateStripeCustomer(user);

    // 6. Create Ephemeral Key
    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2025-02-24.acacia' },
    );

    // 7. Create Subscription with expand
    let subscription: Stripe.Subscription;
    try {
      subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: stripePriceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
          payment_method_types: ['card'],
        },
        expand: ['latest_invoice.payment_intent'], // This expands the invoice and payment_intent
        metadata: {
          userId,
          plan: dto.plan,
          planFor: dto.planFor ?? 'user',
        },
      });

      this.logger.log(
        `Subscription created: ${subscription.id}, status: ${subscription.status}`,
      );
    } catch (err: any) {
      this.logger.error(`Subscription creation failed: ${err.message}`);
      if (err.message.includes('recurring')) {
        throw new BadRequestException(
          `The price ${stripePriceId} is not a recurring price. ` +
            `Please create a recurring price in Stripe Dashboard with a billing period.`,
        );
      }
      throw new BadRequestException(
        `Failed to create subscription: ${err.message}`,
      );
    }

    // 8. FIXED: Safely extract payment intent from expanded subscription
    // Using type assertion since we expanded 'latest_invoice.payment_intent'
    const latestInvoice = subscription.latest_invoice as any;
    const paymentIntent =
      latestInvoice?.payment_intent as Stripe.PaymentIntent | null;
    const clientSecret = paymentIntent?.client_secret || null;

    this.logger.log(
      `Invoice status: ${latestInvoice?.status || 'N/A'}, ` +
        `PaymentIntent: ${paymentIntent?.id || 'N/A'}, ` +
        `ClientSecret exists: ${!!clientSecret}`,
    );

    // 9. Handle cases with no payment intent
    if (!clientSecret) {
      if (
        subscription.status === 'active' ||
        subscription.status === 'trialing'
      ) {
        this.logger.log(
          'Subscription active immediately (likely free trial or $0 price)',
        );
      } else {
        // Cancel the incomplete subscription to avoid orphaned records
        await this.stripe.subscriptions.cancel(subscription.id).catch((err) => {
          this.logger.error(`Failed to cancel subscription: ${err.message}`);
        });

        throw new BadRequestException(
          `Payment setup failed. No payment intent created. ` +
            `This usually means the price ${stripePriceId} is not a recurring price. ` +
            `Please verify in Stripe Dashboard that this price has a billing interval (monthly/yearly).\n` +
            `Invoice status: ${latestInvoice?.status || 'unknown'}`,
        );
      }
    }

    // 10. Save/Update subscription in database
    const planFor = dto.planFor ?? 'user';
    await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: dto.plan as SubscriptionPlan,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId,
        cancelAtPeriodEnd: false,
        isCoachPremium: planFor === 'coach',
        maxClients: planFor === 'coach' ? 999 : 0,
      },
      update: {
        stripeSubscriptionId: subscription.id,
        stripePriceId,
      },
    });

    // 11. Get plan details for response
    const planConfig = await this.prisma.subscriptionPlanConfig.findFirst({
      where: {
        plan: dto.plan as SubscriptionPlan,
        isActive: true,
      },
      select: { id: true, name: true, priceUSD: true },
    });

    this.logger.log(
      `✅ create-intent SUCCESS → user=${userId} plan=${dto.plan} sub=${subscription.id}`,
    );

    return {
      clientSecret: clientSecret ?? '',
      customerId,
      ephemeralKey: ephemeralKey.secret!,
      publishableKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '',
      amount: paymentIntent?.amount ?? latestInvoice?.amount_due ?? 0,
      currency: paymentIntent?.currency ?? latestInvoice?.currency ?? 'usd',
      planName: planConfig?.name ?? `${dto.plan} Premium`,
      planId: planConfig?.id ?? '',
      priceUSD: planConfig?.priceUSD ?? 0,
      subscriptionId: subscription.id,
      requiresPayment: !!clientSecret,
      status: subscription.status,
    };
  }

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
  // STEP 1 — Setup Intent
  // ══════════════════════════════════════════════════════════════════════════

  async createSetupIntent(userId: string): Promise<SetupIntentResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
  // STEP 2 — Subscribe (create subscription with saved card)
  // ══════════════════════════════════════════════════════════════════════════

  async createMobileSubscription(
    userId: string,
    dto: MobileSubscribeDto,
  ): Promise<MobileSubscribeResult> {
    // ── Validate user ──────────────────────────────────────────────────────
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // ── Block duplicate active subscriptions ──────────────────────────────
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

    // ── Get plan config with Stripe price ID ──────────────────────────────
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
      await this.stripe.paymentMethods.attach(dto.paymentMethodId, {
        customer: customerId,
      });
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
      this.logger.error(`[IAP] Stripe subscription creation failed: ${msg}`);
      throw new BadRequestException(`Subscription failed: ${msg}`);
    }

    // ── Extract payment intent (for 3D Secure) ────────────────────────────
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

    // ── Pre-activate in DB (webhook will confirm final state) ─────────────
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

      this.logger.log(
        `[IAP] ✅ Subscribed user=${userId} plan=${dto.plan} sub=${subscription.id}`,
      );
    }

    const statusMessages: Record<string, string> = {
      active: `${dto.plan} subscription activated! You now have premium access.`,
      trialing: `${dto.plan} trial started! Enjoy your premium features.`,
      requires_action:
        'Payment requires 3D Secure verification. Please complete the authentication step.',
      incomplete:
        'Payment is processing. Please complete the payment if prompted.',
    };

    return {
      subscriptionId: subscription.id,
      status: subStatus,
      clientSecret,
      plan: planConfig.name,
      currentPeriodEnd: periodEnd,
      message: statusMessages[subStatus] ?? `Subscription status: ${subStatus}`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Confirm Payment (only for 3D Secure)
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
        : `Payment status: ${subscription.status}. Please contact support if this persists.`,
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
    if (!sub?.stripeCustomerId) {
      return { paymentMethods: [], defaultPaymentMethodId: null };
    }

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
      defaultPaymentMethodId: typeof defaultId === 'string' ? defaultId : null,
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
    if (pm.customer !== sub.stripeCustomerId) {
      throw new BadRequestException(
        'Payment method does not belong to this account.',
      );
    }
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
    if (!sub?.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription to cancel.');
    }
    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Your subscription is already cancelled.');
    }

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
          message: `Your subscription will be cancelled on ${effectiveDate.toLocaleDateString()}.`,
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
          message:
            'Subscription cancelled. Premium access revoked immediately.',
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
  // WEB CHECKOUT (for web users — browser redirect flow)
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
    ) {
      throw new BadRequestException('You already have an active subscription.');
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
        case 'checkout.session.completed':
          await this.onCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session,
          );
          break;
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

  // ── Webhook Handlers ──────────────────────────────────────────────────────

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
    await this.prisma.notification.create({
      data: {
        userId,
        type: NotificationType.PREMIUM_EXPIRY,
        title: '🎉 Premium Activated!',
        body: `Your ${plan} plan is now active. Enjoy all premium features!`,
        data: { plan, periodEnd: periodEnd.toISOString() } as any,
      },
    });
    this.logger.log(
      `[Webhook] ✅ Checkout completed user=${userId} plan=${plan}`,
    );
  }

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
  }

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
    await this.prisma.notification.create({
      data: {
        userId,
        type: NotificationType.PREMIUM_EXPIRY,
        title: 'Subscription Ended',
        body: 'Your premium subscription has ended.',
        data: {} as any,
      },
    });
  }

  private async onInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const inv = invoice as any;
    const subId: string | null =
      typeof inv.subscription === 'string'
        ? inv.subscription
        : (inv.subscription?.id ?? null);
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
              : ((inv.payment_intent as any)?.id ?? null),
          stripeInvoiceId: invoice.id,
          plan: sub?.plan ?? SubscriptionPlan.MONTHLY,
          amount: invoice.amount_paid / 100,
          currency: invoice.currency.toUpperCase(),
          status: PaymentStatus.SUCCEEDED,
          description: `Subscription payment — ${invoice.number ?? invoice.id}`,
        },
      });
    } catch (err: unknown) {
      if ((err as any)?.code !== 'P2002')
        this.logger.error('[Webhook] Failed to record payment');
    }
  }

  private async onInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const inv = invoice as any;
    const subId: string | null =
      typeof inv.subscription === 'string'
        ? inv.subscription
        : (inv.subscription?.id ?? null);
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
              : ((inv.payment_intent as any)?.id ?? null),
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
    await this.prisma.notification.create({
      data: {
        userId,
        type: NotificationType.PREMIUM_EXPIRY,
        title: '⚠️ Payment Failed',
        body: 'Your payment failed. Please update your payment method.',
        data: { invoiceId: invoice.id } as any,
      },
    });
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  // private async getOrCreateStripeCustomer(user: {
  //   id: string;
  //   email: string;
  //   name?: string | null;
  // }): Promise<string> {
  //   const existing = await this.prisma.subscription.findUnique({
  //     where: { userId: user.id },
  //     select: { stripeCustomerId: true },
  //   });
  //   if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  //   const customer = await this.stripe.customers.create({
  //     email: user.email,
  //     name: user.name ?? undefined,
  //     metadata: { userId: user.id },
  //   });
  //   await this.prisma.subscription.upsert({
  //     where: { userId: user.id },
  //     create: {
  //       userId: user.id,
  //       plan: SubscriptionPlan.FREE,
  //       status: SubscriptionStatus.ACTIVE,
  //       stripeCustomerId: customer.id,
  //     },
  //     update: { stripeCustomerId: customer.id },
  //   });
  //   return customer.id;
  // }
  private async getOrCreateStripeCustomer(user: {
    id: string;
    email: string;
    name?: string | null;
  }): Promise<string> {
    // 1. Check DB
    const dbRecord = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { stripeCustomerId: true },
    });

    let customerId = dbRecord?.stripeCustomerId;

    // 2. If we have a customer ID in DB → verify it still exists on Stripe
    if (customerId) {
      try {
        await this.stripe.customers.retrieve(customerId);
        this.logger.log(
          `[Customer] Using existing Stripe customer: ${customerId}`,
        );
        return customerId;
      } catch (err: any) {
        // Customer doesn't exist anymore (deleted or wrong key)
        if (err?.statusCode === 404 || err?.code === 'resource_missing') {
          this.logger.warn(
            `[Customer] Invalid customer ${customerId} - will recreate`,
          );
          customerId = null; // Force recreation
        } else {
          this.logger.error(
            `Failed to retrieve customer ${customerId}: ${err.message}`,
          );
          throw new InternalServerErrorException(
            'Stripe customer verification failed',
          );
        }
      }
    }

    // 3. Create new customer
    try {
      this.logger.log(
        `[Customer] Creating new Stripe customer for user ${user.id}`,
      );

      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { userId: user.id },
      });

      // Save to DB
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

      this.logger.log(`[Customer] ✅ New customer created: ${customer.id}`);
      return customer.id;
    } catch (err: any) {
      this.logger.error(`Failed to create Stripe customer: ${err.message}`);
      throw new InternalServerErrorException(
        `Failed to create Stripe customer: ${err.message}`,
      );
    }
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
