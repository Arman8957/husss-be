// src/modules/subscription-plans/subscription-plans.controller.ts
import {
  Controller, Get, Post, Patch, Put, Delete,
  Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam,
  ApiBody, ApiResponse,
} from '@nestjs/swagger';


import { JwtAuthGuard }   from 'src/common/guards/jwt-auth.guard';
import { RolesGuard }     from 'src/common/guards/roles.guard';
import { SuperAdminGuard } from 'src/common/guards/super-admin.guard';
import { Roles }          from 'src/common/decorators/roles.decorator';
import { CurrentUser }    from 'src/common/decorators/current-user.decorator';
import { SubscriptionPlansService } from './subscriptionsPlan.service';
import { CreateSubscriptionPlanDto, UpdateFeaturesDto, UpdateSubscriptionPlanDto } from './dto/subscriptions.dto';

@ApiTags(' Admin — Subscription Plans')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin/subscription-plans')
export class SubscriptionPlansController {
  constructor(private readonly plansService: SubscriptionPlansService) {}

  // ── GET ALL ───────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get all subscription plan configs',
    description:
      'Returns all 3 plans (FREE, MONTHLY, ANNUAL) ordered by price.\n\n' +
      'Each plan includes:\n' +
      '- `activeSubscribers` — live count of active subscribers\n' +
      '- `hasStripePrice` — whether Stripe Price ID is configured\n' +
      '- `priceLabel` — formatted price string (e.g. "$29.99")\n' +
      '- `periodLabel` — "/month" or "/year"',
  })
  findAll() {
    return this.plansService.findAll();
  }

  // ── GET ONE ───────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get single plan by ID' })
  @ApiParam({ name: 'id', description: 'SubscriptionPlanConfig ID' })
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  // ── CREATE ────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new subscription plan config',
    description:
      'Creates a plan config for FREE, MONTHLY, or ANNUAL.\n\n' +
      '**Only one config per plan type is allowed.**\n' +
      'If the plan type already exists → use PATCH /:id to update it.\n\n' +
      '**Required before Stripe subscriptions work:**\n' +
      '1. Create product + price in Stripe Dashboard\n' +
      '2. Copy Price ID → set as `stripePriceId`',
  })
  create(@Body() dto: CreateSubscriptionPlanDto, @CurrentUser() user: any) {
    return this.plansService.create(dto, user.id);
  }

  // ── UPDATE (PARTIAL) ──────────────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({
    summary: 'Update plan (partial — only send fields to change)',
    description:
      'Partial update — only provided fields are changed.\n\n' +
      'Common updates:\n' +
      '- Change price: `{ priceUSD: 24.99 }`\n' +
      '- Set Stripe Price ID: `{ stripePriceId: "price_..." }`\n' +
      '- Toggle popular badge: `{ isPopular: true }`\n' +
      '- Add savings label: `{ savingsPercent: 17 }`\n' +
      '- Update name: `{ name: "Monthly Premium" }`',
  })
  @ApiParam({ name: 'id', description: 'SubscriptionPlanConfig ID' })
  update(
    @Param('id')  id:  string,
    @Body()       dto: UpdateSubscriptionPlanDto,
    @CurrentUser() user: any,
  ) {
    return this.plansService.update(id, dto, user.id);
  }

  // ── TOGGLE ACTIVE ─────────────────────────────────────────────────────────

  @Patch(':id/toggle-active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle plan active/inactive',
    description:
      'Toggles `isActive` between true/false.\n\n' +
      '`isActive=false` hides the plan from the pricing screen and blocks new subscriptions.\n' +
      'Existing subscribers keep their access.\n\n' +
      'The FREE plan cannot be deactivated.',
  })
  @ApiParam({ name: 'id', description: 'SubscriptionPlanConfig ID' })
  toggleActive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.plansService.toggleActive(id, user.id);
  }

  // ── UPDATE FEATURES ───────────────────────────────────────────────────────

  @Patch(':id/features')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replace feature bullet list',
    description:
      'Replaces the entire features array with the new list.\n\n' +
      'Send items in display order. These appear as bullet points on the pricing card.\n\n' +
      'Example:\n```json\n' +
      '{ "features": ["All workout programs", "BFR Training", "Priority support"] }\n```',
  })
  @ApiParam({ name: 'id', description: 'SubscriptionPlanConfig ID' })
  updateFeatures(
    @Param('id')  id:  string,
    @Body()       dto: UpdateFeaturesDto,
    @CurrentUser() user: any,
  ) {
    return this.plansService.updateFeatures(id, dto, user.id);
  }

  // ── UPSERT (seed / bulk setup) ────────────────────────────────────────────

  @Put('upsert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create or update plan by plan type (upsert)',
    description:
      'Creates if no plan config exists for that plan type.\n' +
      'Updates if it already exists.\n\n' +
      'Use this for initial seeding or scripted updates.',
  })
  upsert(@Body() dto: CreateSubscriptionPlanDto, @CurrentUser() user: any) {
    return this.plansService.upsert(dto, user.id);
  }

  // ── DELETE ────────────────────────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete plan config (SUPER_ADMIN only)',
    description:
      '⚠️ Blocked if active subscribers exist for this plan.\n' +
      'Deactivate (toggle-active) instead of deleting.\n\n' +
      'The FREE plan can never be deleted.',
  })
  @ApiParam({ name: 'id', description: 'SubscriptionPlanConfig ID' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.plansService.remove(id, user.id);
  }
}