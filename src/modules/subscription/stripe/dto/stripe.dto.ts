// src/modules/payments/dto/payment.dto.ts
// All DTOs for the payments module.
// Uses class-validator + class-transformer (already in your project).

import {
  IsEnum, IsOptional, IsBoolean, IsString,
  IsNotEmpty, IsUrl, MaxLength, IsNumber, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
// STEP 1 — Setup Intent
// POST /payments/iap/setup-intent
//
// ✅ NO BODY REQUIRED — user is identified from the JWT token.
//    The endpoint creates (or reuses) a Stripe customer for the logged-in user
//    and returns the credentials needed to init Stripe Payment Sheet.
//
// Response: SetupIntentResult
//   {
//     customerId:              "cus_XXXXXXXX"
//     setupIntentClientSecret: "seti_XXXXXXXX_secret_XXXXXXXX"
//     ephemeralKey:            "ek_test_XXXXXXXX"
//     publishableKey:          "pk_test_XXXXXXXX"
//   }
// ─────────────────────────────────────────────────────────────────────────────

// (No DTO class needed for setup-intent — JWT-only)

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Subscribe (create subscription with saved card)
// POST /payments/iap/subscribe
// ─────────────────────────────────────────────────────────────────────────────

export class MobileSubscribeDto {
  @ApiProperty({
    enum:        ['MONTHLY', 'ANNUAL'],
    example:     'MONTHLY',
    description: 'Which billing period. MONTHLY = $9.99/mo | ANNUAL = $59.99/yr',
  })
  @IsEnum(['MONTHLY', 'ANNUAL'], { message: 'plan must be MONTHLY or ANNUAL' })
  plan!: 'MONTHLY' | 'ANNUAL';

  @ApiProperty({
    enum:        ['user', 'coach'],
    example:     'user',
    description: 'user = regular premium | coach = coach premium (higher limits)',
  })
  @IsEnum(['user', 'coach'], { message: 'planFor must be "user" or "coach"' })
  planFor!: 'user' | 'coach';

  @ApiProperty({
    example:     'pm_card_visa',
    description:
      'Stripe payment method ID.\n\n' +
      'In Postman (test mode): use pm_card_visa, pm_card_mastercard, etc.\n' +
      'In mobile app: obtained from Stripe Payment Sheet after user enters card.\n\n' +
      'Test cards:\n' +
      '  pm_card_visa                     → ✅ Succeeds\n' +
      '  pm_card_mastercard               → ✅ Succeeds\n' +
      '  pm_card_authenticationRequired   → ⚠️ 3D Secure\n' +
      '  pm_card_chargeDeclined           → ❌ Declined\n' +
      '  pm_card_insufficientFunds        → ❌ Insufficient funds',
  })
  @IsString()
  @IsNotEmpty()
  paymentMethodId!: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Confirm (only when step 2 returns status='requires_action')
// POST /payments/iap/confirm
// ─────────────────────────────────────────────────────────────────────────────

export class ConfirmPaymentDto {
  @ApiProperty({
    example:     'sub_1OxYZ2ABCxxxxxxxx',
    description: 'Stripe subscription ID from the /iap/subscribe response.',
  })
  @IsString()
  @IsNotEmpty()
  subscriptionId!: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL SUBSCRIPTION
// POST /payments/cancel
// ─────────────────────────────────────────────────────────────────────────────

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    example:     true,
    default:     true,
    description:
      'true  = cancel at period end (user keeps access until then) — RECOMMENDED\n' +
      'false = cancel immediately (user loses access now)',
  })
  @IsOptional()
  @IsBoolean()
  atPeriodEnd?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEB CHECKOUT SESSION (for web users — browser redirect flow)
// POST /payments/checkout
// ─────────────────────────────────────────────────────────────────────────────

export class CreateCheckoutSessionDto {
  @ApiProperty({
    enum:    ['MONTHLY', 'ANNUAL'],
    example: 'MONTHLY',
  })
  @IsEnum(['MONTHLY', 'ANNUAL'], { message: 'plan must be MONTHLY or ANNUAL' })
  plan!: 'MONTHLY' | 'ANNUAL';

  @ApiProperty({
    enum:    ['user', 'coach'],
    example: 'user',
  })
  @IsEnum(['user', 'coach'], { message: 'planFor must be "user" or "coach"' })
  planFor!: 'user' | 'coach';

  @ApiPropertyOptional({
    example:     'https://app.husss.com/payment/success?session_id={CHECKOUT_SESSION_ID}',
    description: 'Where Stripe redirects after successful payment. Defaults to APP_BASE_URL/payment/success',
  })
  @IsOptional()
  @IsUrl({}, { message: 'successUrl must be a valid URL' })
  @MaxLength(2000)
  successUrl?: string;

  @ApiPropertyOptional({
    example:     'https://app.husss.com/payment/cancel',
    description: 'Where Stripe redirects when user cancels. Defaults to APP_BASE_URL/payment/cancel',
  })
  @IsOptional()
  @IsUrl({}, { message: 'cancelUrl must be a valid URL' })
  @MaxLength(2000)
  cancelUrl?: string;
}


 
export class CreateIntentDto {
  @ApiProperty({
    enum:    ['MONTHLY', 'ANNUAL'],
    example: 'MONTHLY',
    description: 'MONTHLY ($29.99) or ANNUAL ($299.99)',
  })
  @IsEnum(['MONTHLY', 'ANNUAL'])
  plan!: 'MONTHLY' | 'ANNUAL';
 
  @ApiPropertyOptional({
    enum:    ['user', 'coach'],
    default: 'user',
    example: 'user',
  })
  @IsOptional()
  @IsEnum(['user', 'coach'])
  planFor?: 'user' | 'coach';
}
 