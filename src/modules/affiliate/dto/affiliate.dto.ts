// src/modules/affiliate/dto/affiliate.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  Max,
  IsUrl,
  IsNotEmpty,
  ValidateIf,
  IsArray,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export enum SupplementCategoryEnum {
  FOUNDATION  = 'FOUNDATION',
  PERFORMANCE = 'PERFORMANCE',
  RECOVERY    = 'RECOVERY',
  OPTIONAL    = 'OPTIONAL',
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLEMENT PRODUCT QUERIES
// ─────────────────────────────────────────────────────────────────────────────

export class GetSupplementsQueryDto {
  @IsOptional()
  @IsEnum(SupplementCategoryEnum, {
    message: 'category must be one of: FOUNDATION, PERFORMANCE, RECOVERY, OPTIONAL',
  })
  category?: SupplementCategoryEnum;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  inStockOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ─────────────────────────────────────────────────────────────────────────────
// COACH — LINK AFFILIATE PRODUCT
// ─────────────────────────────────────────────────────────────────────────────

export class LinkAffiliateProductDto {
  /**
   * Coach's personal affiliate tracking URL for this product.
   * If omitted, the admin's default affiliate URL is used.
   * Example: "https://suppstore.com/creatine?ref=coach_anna_2024"
   */
  @IsOptional()
  @IsUrl({}, { message: 'customLink must be a valid URL (include https://)' })
  @MaxLength(2000)
  customLink?: string;

  /**
   * Coach's commission percentage (e.g. 5.0 = 5%).
   * Informational only — actual commission is tracked via Stripe/external.
   */
  @IsOptional()
  @IsNumber({}, { message: 'commissionRate must be a number' })
  @Min(0)
  @Max(100)
  commissionRate?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORD AFFILIATE PURCHASE
// ─────────────────────────────────────────────────────────────────────────────

export class RecordAffiliatePurchaseDto {
  /**
   * The AffiliateProduct ID that was purchased.
   */
  @IsString()
  @IsNotEmpty({ message: 'affiliateProductId is required' })
  affiliateProductId!: string;

  /**
   * If the purchase was referred by a specific coach.
   * Optional — used for commission tracking.
   */
  @IsOptional()
  @IsString()
  referringCoachId?: string;

  /**
   * Amount paid by the user (in the specified currency).
   */
  @IsNumber({}, { message: 'amount must be a number' })
  @IsPositive({ message: 'amount must be greater than 0' })
  amount!: number;

  /**
   * ISO 4217 currency code. Defaults to USD.
   */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  /**
   * External order reference from the affiliate platform.
   * E.g. "ORD-SHOPIFY-12345"
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  orderId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG QUERY (for coach browsing admin catalog)
// ─────────────────────────────────────────────────────────────────────────────

export class GetCatalogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}