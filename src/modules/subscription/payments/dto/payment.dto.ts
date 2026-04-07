// // src/modules/payments/dto/payment.dto.ts
// import {
//   IsEnum,
//   IsOptional,
//   IsBoolean,
//   IsString,
//   IsUrl,
//   MaxLength,
//   IsNotEmpty,
// } from 'class-validator';
// import { Transform, Type } from 'class-transformer';
// import { ApiProperty } from '@nestjs/swagger';

// // ─────────────────────────────────────────────────────────────────────────────
// // ENUMS
// // ─────────────────────────────────────────────────────────────────────────────

// export enum SubscriptionPlanEnum {
//   FREE    = 'FREE',
//   MONTHLY = 'MONTHLY',
//   ANNUAL  = 'ANNUAL',
// }

// export enum PlanTargetEnum {
//   USER  = 'user',
//   COACH = 'coach',
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // CREATE CHECKOUT SESSION
// // ─────────────────────────────────────────────────────────────────────────────

// export class CreateCheckoutSessionDto {
//   /**
//    * Which billing period to subscribe to.
//    * MONTHLY = $9.99/month | ANNUAL = $59.99/year
//    */
//   @IsEnum(['MONTHLY', 'ANNUAL'], {
//     message: 'plan must be MONTHLY or ANNUAL',
//   })
//   plan!: 'MONTHLY' | 'ANNUAL';

//   /**
//    * Whether this checkout is for a coach or a regular user.
//    * Determines which SubscriptionPlanConfig record is used (name filter: "Coach").
//    */
//   @IsEnum(['user', 'coach'], {
//     message: 'planFor must be "user" or "coach"',
//   })
//   planFor!: 'user' | 'coach';

//   /**
//    * Where Stripe redirects after successful payment.
//    * Defaults to APP_BASE_URL/payment/success?session_id={CHECKOUT_SESSION_ID}
//    */
//   @IsOptional()
//   @IsUrl({}, { message: 'successUrl must be a valid URL' })
//   @MaxLength(2000)
//   successUrl?: string;

//   /**
//    * Where Stripe redirects when user cancels at checkout.
//    * Defaults to APP_BASE_URL/payment/cancel
//    */
//   @IsOptional()
//   @IsUrl({}, { message: 'cancelUrl must be a valid URL' })
//   @MaxLength(2000)
//   cancelUrl?: string;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // CANCEL SUBSCRIPTION
// // ─────────────────────────────────────────────────────────────────────────────

// export class CancelSubscriptionDto {
//   /**
//    * true  (default): Cancel at end of current billing period.
//    *                  User keeps premium access until period ends.
//    * false:           Cancel immediately. Access revoked now.
//    */
//   @IsOptional()
//   @Transform(({ value }) => value !== false && value !== 'false')
//   @IsBoolean()
//   atPeriodEnd?: boolean = true;
// }


// export class AppleVerifyDto {
//   @ApiProperty({ example: '1000000123456789', description: 'transaction.originalID from StoreKit 2' })
//   @IsString() @IsNotEmpty()
//   originalTransactionId!: string;
 
//   @ApiProperty({ example: 'com.husss.premium.monthly' })
//   @IsString() @IsNotEmpty()
//   productId!: string;
 
//   @ApiProperty({ example: 'eyJhbGciOiJFUzI1NiIsIng1Y...', description: 'transaction.jwsRepresentation from StoreKit 2' })
//   @IsString() @IsNotEmpty()
//   jwsTransaction!: string;
// }
 
// export class GoogleVerifyDto {
//   @ApiProperty({ example: 'bkdabcde...', description: 'purchase.getPurchaseToken() from Google Play Billing' })
//   @IsString() @IsNotEmpty()
//   purchaseToken!: string;
 
//   @ApiProperty({ example: 'GPA.1234-5678-9012-34567', description: 'purchase.getOrderId()' })
//   @IsString() @IsNotEmpty()
//   orderId!: string;
 
//   @ApiProperty({ example: 'husss_premium_monthly', description: 'Subscription ID from Google Play Console' })
//   @IsString() @IsNotEmpty()
//   productId!: string;
// }
 