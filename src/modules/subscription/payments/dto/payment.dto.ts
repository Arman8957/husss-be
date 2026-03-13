// src/modules/payments/dto/payment.dto.ts
import {
  IsEnum,
  IsOptional,
  IsBoolean,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export enum SubscriptionPlanEnum {
  FREE    = 'FREE',
  MONTHLY = 'MONTHLY',
  ANNUAL  = 'ANNUAL',
}

export enum PlanTargetEnum {
  USER  = 'user',
  COACH = 'coach',
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE CHECKOUT SESSION
// ─────────────────────────────────────────────────────────────────────────────

export class CreateCheckoutSessionDto {
  /**
   * Which billing period to subscribe to.
   * MONTHLY = $9.99/month | ANNUAL = $59.99/year
   */
  @IsEnum(['MONTHLY', 'ANNUAL'], {
    message: 'plan must be MONTHLY or ANNUAL',
  })
  plan!: 'MONTHLY' | 'ANNUAL';

  /**
   * Whether this checkout is for a coach or a regular user.
   * Determines which SubscriptionPlanConfig record is used (name filter: "Coach").
   */
  @IsEnum(['user', 'coach'], {
    message: 'planFor must be "user" or "coach"',
  })
  planFor!: 'user' | 'coach';

  /**
   * Where Stripe redirects after successful payment.
   * Defaults to APP_BASE_URL/payment/success?session_id={CHECKOUT_SESSION_ID}
   */
  @IsOptional()
  @IsUrl({}, { message: 'successUrl must be a valid URL' })
  @MaxLength(2000)
  successUrl?: string;

  /**
   * Where Stripe redirects when user cancels at checkout.
   * Defaults to APP_BASE_URL/payment/cancel
   */
  @IsOptional()
  @IsUrl({}, { message: 'cancelUrl must be a valid URL' })
  @MaxLength(2000)
  cancelUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL SUBSCRIPTION
// ─────────────────────────────────────────────────────────────────────────────

export class CancelSubscriptionDto {
  /**
   * true  (default): Cancel at end of current billing period.
   *                  User keeps premium access until period ends.
   * false:           Cancel immediately. Access revoked now.
   */
  @IsOptional()
  @Transform(({ value }) => value !== false && value !== 'false')
  @IsBoolean()
  atPeriodEnd?: boolean = true;
}
