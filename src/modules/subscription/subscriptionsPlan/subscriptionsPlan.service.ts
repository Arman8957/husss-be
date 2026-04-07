// src/modules/subscription-plans/subscription-plans.service.ts
//
// Manages the 3 pricing tiers: FREE | MONTHLY | ANNUAL
// Each plan has exactly ONE config record (unique by plan enum).
//
// Admin can:
//   - View all plans (GET)
//   - Create new plan config (POST) — fails if plan type already exists
//   - Update plan by ID (PATCH) — partial, only provided fields
//   - Toggle isActive (PATCH /:id/toggle-active)
//   - Update features list (PATCH /:id/features)
//   - Delete plan config (DELETE) — blocked if active subscriptions exist
//
// Used by:
//   - Pricing screen (mobile app) → GET /api/v1/payments/plans
//   - Admin pricing management   → GET /api/v1/admin/subscription-plans

import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { CreateSubscriptionPlanDto, UpdateFeaturesDto, UpdateSubscriptionPlanDto } from './dto/subscriptions.dto';


@Injectable()
export class SubscriptionPlansService {
  private readonly logger = new Logger(SubscriptionPlansService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // GET ALL PLANS
  // Returns all plans ordered by price asc (FREE → MONTHLY → ANNUAL).
  // Includes live subscriber counts per plan.
  // ══════════════════════════════════════════════════════════════════════════

  async findAll() {
    const [plans, subscriberCounts] = await Promise.all([
      this.prisma.subscriptionPlanConfig.findMany({
        orderBy: { priceUSD: 'asc' },
      }),

      // Count ACTIVE subscribers per plan
      this.prisma.subscription.groupBy({
        by:     ['plan'],
        where:  { status: SubscriptionStatus.ACTIVE },
        _count: { id: true },
      }),
    ]);

    const countMap = new Map(
      subscriberCounts.map((s) => [s.plan, s._count.id]),
    );

    return plans.map((p) => ({
      ...p,
      activeSubscribers: countMap.get(p.plan as SubscriptionPlan) ?? 0,
      priceLabel:        p.priceUSD === 0 ? 'Free' : `$${p.priceUSD.toFixed(2)}`,
      periodLabel:       p.billingPeriod === 'ANNUAL' ? '/year' : p.billingPeriod === 'MONTHLY' ? '/month' : '',
      hasStripePrice:    !!p.stripePriceId,
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET SINGLE PLAN BY ID
  // ══════════════════════════════════════════════════════════════════════════

  async findOne(id: string) {
    const plan = await this.prisma.subscriptionPlanConfig.findUnique({
      where: { id },
    });
    if (!plan) throw new NotFoundException(`Subscription plan "${id}" not found.`);

    const activeSubscribers = await this.prisma.subscription.count({
      where: { plan: plan.plan as SubscriptionPlan, status: SubscriptionStatus.ACTIVE },
    });

    return {
      ...plan,
      activeSubscribers,
      priceLabel:  plan.priceUSD === 0 ? 'Free' : `$${plan.priceUSD.toFixed(2)}`,
      periodLabel: plan.billingPeriod === 'ANNUAL' ? '/year' : plan.billingPeriod === 'MONTHLY' ? '/month' : '',
      hasStripePrice: !!plan.stripePriceId,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREATE PLAN
  // Only ONE config per plan type (FREE | MONTHLY | ANNUAL) is allowed.
  // If a record already exists for the plan → throws 409 Conflict.
  // ══════════════════════════════════════════════════════════════════════════

  async create(dto: CreateSubscriptionPlanDto, adminUserId: string) {
    // Check for duplicate plan type
    const existing = await this.prisma.subscriptionPlanConfig.findUnique({
      where: { plan: dto.plan as SubscriptionPlan },
    });
    if (existing) {
      throw new ConflictException(
        `A plan config for "${dto.plan}" already exists (id: ${existing.id}). ` +
        `Use PATCH /admin/subscription-plans/${existing.id} to update it instead.`,
      );
    }

    const plan = await this.prisma.subscriptionPlanConfig.create({
      data: {
        name:          dto.name,
        plan:          dto.plan as SubscriptionPlan,
        billingPeriod: dto.billingPeriod ?? null,
        priceUSD:      dto.priceUSD,
        isPopular:     dto.isPopular    ?? false,
        savingsPercent: dto.savingsPercent ?? null,
        features:      dto.features,
        stripePriceId: dto.stripePriceId ?? null,
        isActive:      dto.isActive     ?? true,
        updatedBy:     adminUserId,
      },
    });

    this.logger.log(`[Plans] Created plan "${dto.plan}" by admin=${adminUserId}`);
    await this.logAction(adminUserId, 'CREATE_PLAN', plan.id, dto);

    return plan;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE PLAN (PARTIAL)
  // Send only the fields you want to change.
  // ══════════════════════════════════════════════════════════════════════════

  async update(id: string, dto: UpdateSubscriptionPlanDto, adminUserId: string) {
    const existing = await this.prisma.subscriptionPlanConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Subscription plan "${id}" not found.`);

    // Build update payload — only provided fields
    const data: Record<string, any> = { updatedBy: adminUserId };
    if (dto.name          !== undefined) data.name          = dto.name;
    if (dto.billingPeriod !== undefined) data.billingPeriod = dto.billingPeriod;
    if (dto.priceUSD      !== undefined) data.priceUSD      = dto.priceUSD;
    if (dto.isPopular     !== undefined) data.isPopular     = dto.isPopular;
    if (dto.savingsPercent !== undefined) data.savingsPercent = dto.savingsPercent;
    if (dto.features      !== undefined) data.features      = dto.features;
    if (dto.stripePriceId !== undefined) data.stripePriceId = dto.stripePriceId;
    if (dto.isActive      !== undefined) data.isActive      = dto.isActive;

    if (Object.keys(data).length === 1) { // only updatedBy
      throw new BadRequestException('No fields to update. Provide at least one field.');
    }

    const updated = await this.prisma.subscriptionPlanConfig.update({
      where: { id },
      data,
    });

    this.logger.log(`[Plans] Updated plan "${existing.plan}" by admin=${adminUserId}: ${Object.keys(data).filter(k => k !== 'updatedBy').join(', ')}`);
    await this.logAction(adminUserId, 'UPDATE_PLAN', id, { updatedFields: Object.keys(data).filter(k => k !== 'updatedBy'), values: dto });

    return {
      ...updated,
      updatedFields: Object.keys(data).filter((k) => k !== 'updatedBy'),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOGGLE ACTIVE (quick enable/disable)
  // PATCH /admin/subscription-plans/:id/toggle-active
  // ══════════════════════════════════════════════════════════════════════════

  async toggleActive(id: string, adminUserId: string) {
    const existing = await this.prisma.subscriptionPlanConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Subscription plan "${id}" not found.`);

    // Prevent deactivating FREE plan — always needs to exist
    if (existing.plan === SubscriptionPlan.FREE && existing.isActive) {
      throw new BadRequestException('Cannot deactivate the FREE plan.');
    }

    const updated = await this.prisma.subscriptionPlanConfig.update({
      where: { id },
      data:  { isActive: !existing.isActive, updatedBy: adminUserId },
    });

    await this.logAction(adminUserId, updated.isActive ? 'ACTIVATE_PLAN' : 'DEACTIVATE_PLAN', id, { plan: existing.plan });

    return {
      ...updated,
      message: `Plan "${existing.name}" is now ${updated.isActive ? 'active' : 'inactive'}.`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE FEATURES (replace feature bullet list)
  // PATCH /admin/subscription-plans/:id/features
  // ══════════════════════════════════════════════════════════════════════════

  async updateFeatures(id: string, dto: UpdateFeaturesDto, adminUserId: string) {
    const existing = await this.prisma.subscriptionPlanConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Subscription plan "${id}" not found.`);

    const updated = await this.prisma.subscriptionPlanConfig.update({
      where: { id },
      data:  { features: dto.features, updatedBy: adminUserId },
    });

    return {
      ...updated,
      message: `Features updated for plan "${existing.name}".`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE PLAN
  // Blocked if ANY active subscriptions use this plan.
  // ══════════════════════════════════════════════════════════════════════════

  async remove(id: string, adminUserId: string) {
    const existing = await this.prisma.subscriptionPlanConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Subscription plan "${id}" not found.`);

    // FREE plan can never be deleted
    if (existing.plan === SubscriptionPlan.FREE) {
      throw new ForbiddenException('The FREE plan config cannot be deleted.');
    }

    // Block if active subscribers exist
    const activeCount = await this.prisma.subscription.count({
      where: {
        plan:   existing.plan as SubscriptionPlan,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    if (activeCount > 0) {
      throw new ConflictException(
        `Cannot delete: ${activeCount} user(s) have an active ${existing.plan} subscription. ` +
        `Deactivate the plan (isActive=false) instead to stop new subscriptions.`,
      );
    }

    await this.prisma.subscriptionPlanConfig.delete({ where: { id } });
    await this.logAction(adminUserId, 'DELETE_PLAN', id, { plan: existing.plan, name: existing.name });

    return {
      success: true,
      message: `Plan "${existing.name}" (${existing.plan}) deleted successfully.`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPSERT (create or update by plan type)
  // Used for seeding / bulk setup.
  // PUT /admin/subscription-plans/upsert
  // ══════════════════════════════════════════════════════════════════════════

  async upsert(dto: CreateSubscriptionPlanDto, adminUserId: string) {
    const result = await this.prisma.subscriptionPlanConfig.upsert({
      where:  { plan: dto.plan as SubscriptionPlan },
      create: {
        name: dto.name, plan: dto.plan as SubscriptionPlan,
        billingPeriod: dto.billingPeriod ?? null, priceUSD: dto.priceUSD,
        isPopular: dto.isPopular ?? false, savingsPercent: dto.savingsPercent ?? null,
        features: dto.features, stripePriceId: dto.stripePriceId ?? null,
        isActive: dto.isActive ?? true, updatedBy: adminUserId,
      },
      update: {
        name: dto.name, billingPeriod: dto.billingPeriod ?? null,
        priceUSD: dto.priceUSD, isPopular: dto.isPopular ?? false,
        savingsPercent: dto.savingsPercent ?? null, features: dto.features,
        stripePriceId: dto.stripePriceId ?? null,
        isActive: dto.isActive ?? true, updatedBy: adminUserId,
      },
    });

    await this.logAction(adminUserId, 'UPSERT_PLAN', result.id, dto);
    return result;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async logAction(adminUserId: string, action: string, targetId: string, details: object) {
    await this.prisma.adminActivityLog
      .create({ data: { adminUserId, action, targetType: 'SubscriptionPlanConfig', targetId, details } })
      .catch(() => {});
  }
}