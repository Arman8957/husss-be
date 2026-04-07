// src/modules/subscription-plans/dto/subscription-plan.dto.ts

import {
  IsEnum, IsString, IsNumber, IsBoolean, IsArray,
  IsOptional, IsNotEmpty, Min, Max, MinLength, MaxLength,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────────────────────────────────────
// Enums (matching Prisma schema)
// ─────────────────────────────────────────────────────────────────────────────

export enum SubscriptionPlanEnum {
  FREE    = 'FREE',
  MONTHLY = 'MONTHLY',
  ANNUAL  = 'ANNUAL',
}

export enum BillingPeriodEnum {
  MONTHLY = 'MONTHLY',
  ANNUAL  = 'ANNUAL',
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE PLAN DTO
// POST /api/v1/admin/subscription-plans
// ─────────────────────────────────────────────────────────────────────────────

export class CreateSubscriptionPlanDto {
  @ApiProperty({
    example: 'Monthly Premium',
    description: 'Display name shown in the pricing screen',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({
    enum:        SubscriptionPlanEnum,
    example:     'MONTHLY',
    description:
      'Plan tier. Only ONE config per plan type allowed (FREE, MONTHLY, ANNUAL).\n' +
      'Creating a second record for the same plan → updates the existing one.',
  })
  @IsEnum(SubscriptionPlanEnum, { message: 'plan must be FREE, MONTHLY, or ANNUAL' })
  plan!: SubscriptionPlanEnum;

  @ApiPropertyOptional({
    enum:    BillingPeriodEnum,
    example: 'MONTHLY',
    description: 'MONTHLY | ANNUAL. Leave empty for FREE plan.',
  })
  @IsOptional()
  @IsEnum(BillingPeriodEnum)
  billingPeriod?: BillingPeriodEnum;

  @ApiProperty({
    example:     29.99,
    description: 'Price in USD. Set to 0 for FREE plan.',
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'priceUSD must be a valid dollar amount' })
  @Min(0, { message: 'priceUSD cannot be negative' })
  @Max(9999.99)
  @Type(() => Number)
  priceUSD!: number;

  @ApiPropertyOptional({
    example:     true,
    description: 'Shows "POPULAR" badge on pricing card.',
    default:     false,
  })
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional({
    example:     17,
    description: 'Savings % to display (e.g. 17 → "Save 17%"). Set for ANNUAL plans.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  savingsPercent?: number;

  @ApiProperty({
    example:     ['All workout programs', 'BFR Training', 'Priority support'],
    description: 'Feature bullet list shown on the pricing card.',
  })
  @IsArray()
  @IsString({ each: true })
  features!: string[];

  @ApiPropertyOptional({
    example:     'price_1OxABCDEFGHIJKL',
    description:
      'Stripe Price ID from Stripe Dashboard → Products → (your plan) → copy Price ID.\n' +
      'Required before users can subscribe via Stripe.',
  })
  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'false = plan is hidden from pricing screen and blocks new subscriptions.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PLAN DTO — all fields optional (partial update)
// PATCH /api/v1/admin/subscription-plans/:id
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateSubscriptionPlanDto {
  @ApiPropertyOptional({ example: 'Monthly Premium', description: 'Display name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: BillingPeriodEnum })
  @IsOptional()
  @IsEnum(BillingPeriodEnum)
  billingPeriod?: BillingPeriodEnum;

  @ApiPropertyOptional({ example: 29.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999.99)
  @Type(() => Number)
  priceUSD?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional({ example: 17 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  savingsPercent?: number;

  @ApiPropertyOptional({ example: ['All programs', 'BFR Training'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ example: 'price_1OxABCDEFGHIJKL' })
  @IsOptional()
  @IsString()
  stripePriceId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// REORDER FEATURES DTO
// PATCH /api/v1/admin/subscription-plans/:id/features
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateFeaturesDto {
  @ApiProperty({
    example: ['All workout programs', 'BFR Training', 'Priority support', 'Progress tracking'],
    description: 'Full ordered list of feature strings. Replaces existing features.',
  })
  @IsArray()
  @IsString({ each: true })
  features!: string[];
}