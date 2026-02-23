// src/content/dto/content.dto.ts
// DTOs for all user-facing content endpoints:
// Supplements, Health Checks, Partner Clinics, BFR Content,
// Execution Notes, Essential Content, Protein Calculator, Water Intake

import {
  IsString, IsOptional, IsBoolean, IsEnum,
  IsNumber, IsPositive, IsInt, Min, Max,
  IsDateString, IsArray, IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── SUPPLEMENT QUERIES ──────────────────────────────────────────────────────

export class SupplementQueryDto {
  @IsOptional()
  @IsEnum(['FOUNDATION', 'PERFORMANCE', 'RECOVERY', 'OPTIONAL'])
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  inStockOnly?: boolean = true;
}

// ─── PROTEIN CALCULATOR ───────────────────────────────────────────────────────

export class CalculateProteinDto {
  @IsNumber()
  @IsPositive()
  targetLeanBodyWeight!: number; // in kg or lb — use user's preferred unit

  @IsOptional()
  @IsEnum(['KG', 'LB'])
  weightUnit?: 'KG' | 'LB';

  @IsOptional()
  @IsEnum(['maintenance', 'bulking', 'cutting'])
  goal?: string;

  @IsOptional()
  @IsBoolean()
  save?: boolean = false; // if true, persist to ProteinCalculation table
}

// ─── WATER INTAKE ─────────────────────────────────────────────────────────────

export class LogWaterIntakeDto {
  @IsDateString()
  date!: string; // "2026-02-15"

  @IsNumber()
  @IsPositive()
  liters!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  goal?: number; // default 3.5L
}

// ─── PARTNER CLINICS ─────────────────────────────────────────────────────────

export class ClinicQueryDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  location?: string; // free-text location filter

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

// ─── BFR CONTENT ─────────────────────────────────────────────────────────────

export class BFRContentQueryDto {
  @IsOptional()
  @IsEnum(['SAFETY_DISCLAIMER', 'BFR_SESSION', 'RESEARCH_AND_EDUCATION'])
  category?: string;

  @IsOptional()
  @IsEnum(['HYPERTROPHY', 'STRENGTH', 'ENDURANCE', 'RECOVERY'])
  sessionCategory?: string;

  @IsOptional()
  @IsEnum(['UPPER', 'LOWER', 'FULL_BODY'])
  bodyType?: string;
}

// ─── EXECUTION NOTES ─────────────────────────────────────────────────────────

export class ExecutionNoteQueryDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  activeOnly?: boolean = true;
}

// ─── HEALTH CHECKS ───────────────────────────────────────────────────────────

export class HealthCheckQueryDto {
  @IsOptional()
  @IsEnum([
    'HORMONAL_BALANCE', 'INFLAMMATION_MARKERS',
    'NUTRIENT_LEVELS', 'BLOOD_PRESSURE_CARDIOVASCULAR', 'GENERAL',
  ])
  category?: string;
}

// ─── SUBSCRIPTION PLAN ───────────────────────────────────────────────────────

export class InitiatePurchaseDto {
  @IsEnum(['MONTHLY', 'ANNUAL'])
  plan!: 'MONTHLY' | 'ANNUAL';

  // If integrating Stripe — payment method ID
  @IsOptional()
  @IsString()
  paymentMethodId?: string;
}