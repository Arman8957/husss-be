// // src/modules/payments/iap.controller.ts
// import {
//   Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus,
// } from '@nestjs/common';
// import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiProperty } from '@nestjs/swagger';
// import { IsString, IsNotEmpty } from 'class-validator';

// import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
// import { CurrentUser }  from 'src/common/decorators/current-user.decorator';
// import { IAPService } from './payment.service';
// import { AppleVerifyDto, GoogleVerifyDto } from './dto/payment.dto';


// @ApiTags('📱 In-App Purchases')
// @Controller('iap')
// export class IAPController {
//   constructor(private readonly iapService: IAPService) {}

//   @Post('apple/verify')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('JWT-auth')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({
//     summary: 'Verify iOS purchase (StoreKit 2)',
//     description:
//       'Call after successful purchase in your iOS app.\n\n' +
//       '**iOS:** After `product.purchase()` succeeds, send `transaction.jwsRepresentation` here.\n\n' +
//       '**Returns:** `{ success, isPremium, plan, expiresAt, environment }`',
//   })
//   verifyApple(@CurrentUser() user: any, @Body() dto: AppleVerifyDto) {
//     return this.iapService.verifyApplePurchase(user.id, dto);
//   }

//   @Post('google/verify')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('JWT-auth')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({
//     summary: 'Verify Android purchase (Google Play Billing)',
//     description:
//       'Call after successful purchase in your Android app.\n\n' +
//       '**Android:** After `BillingClient.launchBillingFlow()` succeeds, send `purchase.purchaseToken` here.\n\n' +
//       '**Returns:** `{ success, isPremium, plan, expiresAt, environment }`',
//   })
//   verifyGoogle(@CurrentUser() user: any, @Body() dto: GoogleVerifyDto) {
//     return this.iapService.verifyGooglePurchase(user.id, dto);
//   }

//   @Get('status')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('JWT-auth')
//   @ApiOperation({
//     summary: 'Get IAP subscription status',
//     description: 'Call on app launch and after purchases to check if user is premium.',
//   })
//   getStatus(@CurrentUser() user: any) {
//     return this.iapService.getIAPStatus(user.id);
//   }

//   @Post('apple/restore')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('JWT-auth')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Restore iOS purchases (reinstall / new device)' })
//   restoreApple(@CurrentUser() user: any, @Body() dto: AppleVerifyDto) {
//     return this.iapService.restoreApple(user.id, dto);
//   }

//   @Post('google/restore')
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('JWT-auth')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Restore Android purchases (reinstall / new device)' })
//   restoreGoogle(@CurrentUser() user: any, @Body() dto: GoogleVerifyDto) {
//     return this.iapService.restoreGoogle(user.id, dto);
//   }

//   // Webhooks — no auth (called by Apple/Google servers)
//   @Post('apple/webhook')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: '[Apple webhook] App Store Server Notifications v2' })
//   appleWebhook(@Body() body: any) {
//     return this.iapService.handleAppleWebhook(body);
//   }

//   @Post('google/webhook')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: '[Google webhook] Play Real-Time Developer Notifications' })
//   googleWebhook(@Body() body: any) {
//     return this.iapService.handleGoogleWebhook(body);
//   }
// }