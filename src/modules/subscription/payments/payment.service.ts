// // src/modules/payments/iap.service.ts
// // FIXES: SubscriptionPlan.MONTHLY/ANNUAL, no googleapis/axios, native fetch, import type
// // INSTALL: npm install jsonwebtoken && npm install --save-dev @types/jsonwebtoken

// import {
//   Injectable, BadRequestException, Logger,
//   UnauthorizedException, InternalServerErrorException,
// } from '@nestjs/common';
// import { ConfigService }  from '@nestjs/config';
// import { PrismaService }  from 'src/prisma/prisma.service';
// import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
// import * as jwt from 'jsonwebtoken';

// export type IAPPlatformType = 'APPLE' | 'GOOGLE';

// // ✅ FIX: MONTHLY / ANNUAL — matches your actual enum (FREE | MONTHLY | ANNUAL)
// const PRODUCT_PLAN_MAP: Record<string, SubscriptionPlan> = {
//   'com.husss.premium.monthly': SubscriptionPlan.MONTHLY,
//   'com.husss.premium.yearly':  SubscriptionPlan.ANNUAL,
//   'com.husss.premium.annual':  SubscriptionPlan.ANNUAL,
//   'com.husss.coach.monthly':   SubscriptionPlan.MONTHLY,
//   'com.husss.coach.yearly':    SubscriptionPlan.ANNUAL,
//   'husss_premium_monthly':     SubscriptionPlan.MONTHLY,
//   'husss_premium_yearly':      SubscriptionPlan.ANNUAL,
//   'husss_premium_annual':      SubscriptionPlan.ANNUAL,
//   'husss_coach_monthly':       SubscriptionPlan.MONTHLY,
//   'husss_coach_yearly':        SubscriptionPlan.ANNUAL,
// };

// // ✅ FIX: interfaces (not classes) → no decorator issues with isolatedModules
// export interface VerifyAppleReceiptDto {
//   originalTransactionId: string;
//   productId: string;
//   jwsTransaction: string;
// }

// export interface VerifyGoogleReceiptDto {
//   purchaseToken: string;
//   orderId: string;
//   productId: string;
// }

// export interface IAPVerifyResult {
//   success:     boolean;
//   isPremium:   boolean;
//   plan:        SubscriptionPlan;
//   expiresAt:   Date | null;
//   environment: string;
//   platform:    IAPPlatformType;
//   message:     string;
// }

// @Injectable()
// export class IAPService {
//   private readonly logger = new Logger(IAPService.name);
//   constructor(
//     private readonly prisma:  PrismaService,
//     private readonly config:  ConfigService,
//   ) {}

//   // ── APPLE VERIFY ──────────────────────────────────────────────────────────
//   async verifyApplePurchase(userId: string, dto: VerifyAppleReceiptDto): Promise<IAPVerifyResult> {
//     this.logger.log(`[Apple] verify user=${userId} product=${dto.productId}`);

//     // Decode JWS from StoreKit 2
//     let txPayload: Record<string, any>;
//     try {
//       const parts = dto.jwsTransaction.split('.');
//       txPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
//     } catch {
//       throw new BadRequestException('Invalid jwsTransaction — must be a valid StoreKit 2 JWS string.');
//     }

//     const {
//       originalTransactionId = dto.originalTransactionId,
//       productId             = dto.productId,
//       expiresDate,
//       purchaseDate,
//       environment,
//     } = txPayload;

//     // Call Apple App Store Server API v2 (native fetch, no axios)
//     let serverResponse: Record<string, any> | null = null;
//     try {
//       const apiJwt   = this.buildAppleJWT();
//       const isSandbox = String(environment ?? '').toLowerCase().includes('sandbox');
//       const baseUrl  = isSandbox
//         ? 'https://api.storekit-sandbox.itunes.apple.com'
//         : 'https://api.storekit.itunes.apple.com';

//       const res = await fetch(
//         `${baseUrl}/inApps/v1/subscriptions/${originalTransactionId}`,
//         { headers: { Authorization: `Bearer ${apiJwt}` }, signal: AbortSignal.timeout(10_000) },
//       );
//       if (res.status === 404) throw new BadRequestException('Transaction not found on Apple servers.');
//       if (res.ok) serverResponse = await res.json() as Record<string, any>;
//     } catch (err: any) {
//       if (err instanceof BadRequestException) throw err;
//       this.logger.warn(`[Apple] API unavailable, using JWS: ${err.message}`);
//     }

//     const plan = PRODUCT_PLAN_MAP[productId as string];
//     if (!plan) throw new BadRequestException(`Unknown productId: "${productId}". Add to PRODUCT_PLAN_MAP.`);

//     const expiresAt   = expiresDate  ? new Date(Number(expiresDate))  : null;
//     const purchasedAt = purchaseDate ? new Date(Number(purchaseDate)) : new Date();
//     const envStr      = String(environment ?? '').toLowerCase().includes('sandbox') ? 'SANDBOX' : 'PRODUCTION';

//     if (expiresAt && expiresAt < new Date()) {
//       return { success: false, isPremium: false, plan, expiresAt, environment: envStr, platform: 'APPLE',
//                message: 'Apple subscription expired. Please renew in the App Store.' };
//     }

//     // Replay prevention
//     const existing = await this.prisma.iAPReceipt.findUnique({ where: { transactionId: originalTransactionId as string } });
//     if (existing && existing.userId !== userId) throw new UnauthorizedException('Receipt belongs to another account.');

//     await this.upsertSubscription({ userId, platform: 'APPLE', transactionId: originalTransactionId as string,
//       productId: productId as string, receiptData: dto.jwsTransaction,
//       serverRaw: serverResponse ? JSON.stringify(serverResponse) : null,
//       plan, expiresAt, purchasedAt, envStr, autoRenewing: null });

//     this.logger.log(`[Apple] ✅ user=${userId} plan=${plan} expires=${expiresAt}`);
//     return { success: true, isPremium: true, plan, expiresAt, environment: envStr, platform: 'APPLE',
//              message: `${plan} subscription activated via Apple.` };
//   }

//   // ── GOOGLE VERIFY ─────────────────────────────────────────────────────────
//   async verifyGooglePurchase(userId: string, dto: VerifyGoogleReceiptDto): Promise<IAPVerifyResult> {
//     this.logger.log(`[Google] verify user=${userId} product=${dto.productId}`);

//     const packageName = this.config.get<string>('GOOGLE_PLAY_PACKAGE_NAME');
//     const saJson      = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON');
//     if (!packageName || !saJson) throw new InternalServerErrorException('Google Play credentials not configured.');

//     // ✅ FIX: no googleapis — get token via JWT assertion + native fetch
//     const accessToken = await this.getGoogleAccessToken(saJson);

//     const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${dto.purchaseToken}`;
//     let purchaseData: Record<string, any>;
//     try {
//       const res = await fetch(apiUrl, {
//         headers: { Authorization: `Bearer ${accessToken}` },
//         signal:  AbortSignal.timeout(10_000),
//       });
//       if (res.status === 400 || res.status === 404) throw new BadRequestException('Invalid purchaseToken.');
//       if (!res.ok) throw new InternalServerErrorException(`Google Play API returned ${res.status}.`);
//       purchaseData = await res.json() as Record<string, any>;
//     } catch (err: any) {
//       if (err instanceof BadRequestException || err instanceof InternalServerErrorException) throw err;
//       throw new InternalServerErrorException(`Google API error: ${err.message}`);
//     }

//     const { subscriptionState, lineItems, startTime, testPurchase } = purchaseData;
//     const lineItem   = (lineItems as any[])?.[0];
//     const expiryTime = lineItem?.expiryTime;
//     const autoRenew  = lineItem?.autoRenewingPlan?.autoRenewEnabled ?? false;
//     const productId  = lineItem?.productId ?? dto.productId;
//     const envStr     = testPurchase ? 'SANDBOX' : 'PRODUCTION';
//     const isActive   = subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE';

//     const plan = PRODUCT_PLAN_MAP[productId as string];
//     if (!plan) throw new BadRequestException(`Unknown Google productId: "${productId}".`);

//     const expiresAt   = expiryTime ? new Date(expiryTime as string) : null;
//     const purchasedAt = startTime  ? new Date(startTime as string)  : new Date();

//     if (!isActive) {
//       return { success: false, isPremium: false, plan, expiresAt, environment: envStr, platform: 'GOOGLE',
//                message: `Google subscription state: "${subscriptionState}". Not active.` };
//     }

//     const existing = await this.prisma.iAPReceipt.findFirst({
//       where: { receiptData: dto.purchaseToken, platform: 'GOOGLE' },
//     });
//     if (existing && existing.userId !== userId) throw new UnauthorizedException('Token belongs to another account.');

//     await this.upsertSubscription({ userId, platform: 'GOOGLE', transactionId: dto.orderId,
//       productId: productId as string, receiptData: dto.purchaseToken,
//       serverRaw: JSON.stringify(purchaseData), plan, expiresAt, purchasedAt, envStr, autoRenewing: autoRenew as boolean });

//     this.logger.log(`[Google] ✅ user=${userId} plan=${plan} expires=${expiresAt}`);
//     return { success: true, isPremium: true, plan, expiresAt, environment: envStr, platform: 'GOOGLE',
//              message: `${plan} subscription activated via Google Play.` };
//   }

//   // ── STATUS ────────────────────────────────────────────────────────────────
//   async getIAPStatus(userId: string) {
//     const [sub, receipt] = await Promise.all([
//       this.prisma.subscription.findUnique({
//         where: { userId },
//         select: { plan: true, status: true, iapPlatform: true, iapProductId: true,
//                   iapExpiresAt: true, iapAutoRenewing: true, iapEnvironment: true,
//                   currentPeriodEnd: true, cancelAtPeriodEnd: true },
//       }),
//       this.prisma.iAPReceipt.findFirst({
//         where: { userId, isValid: true }, orderBy: { createdAt: 'desc' },
//         select: { platform: true, expiresAt: true, productId: true, purchasedAt: true },
//       }),
//     ]);

//     if (!sub) return { isPremium: false, plan: 'FREE', status: 'INACTIVE', platform: null };

//     const now = new Date();
//     const expiresAt  = sub.iapExpiresAt ?? sub.currentPeriodEnd;
//     const notExpired = !expiresAt || expiresAt > now;
//     const isActive   = sub.status === SubscriptionStatus.ACTIVE && notExpired;

//     return {
//       isPremium:     isActive,
//       plan:          sub.plan,
//       status:        sub.status,
//       platform:      sub.iapPlatform ?? null,
//       productId:     sub.iapProductId ?? receipt?.productId ?? null,
//       expiresAt,
//       daysRemaining: expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000)) : null,
//       autoRenewing:  sub.iapAutoRenewing ?? !sub.cancelAtPeriodEnd,
//       environment:   sub.iapEnvironment ?? null,
//       willCancelAt:  sub.cancelAtPeriodEnd ? expiresAt : null,
//     };
//   }

//   async restoreApple(userId: string, dto: VerifyAppleReceiptDto)  { return this.verifyApplePurchase(userId, dto); }
//   async restoreGoogle(userId: string, dto: VerifyGoogleReceiptDto) { return this.verifyGooglePurchase(userId, dto); }

//   // ── APPLE WEBHOOK ─────────────────────────────────────────────────────────
//   async handleAppleWebhook(body: any): Promise<{ received: boolean }> {
//     const { signedPayload } = body ?? {};
//     if (!signedPayload) return { received: false };
//     let payload: Record<string, any>; let txInfo: Record<string, any> | null = null;
//     try {
//       const p = (signedPayload as string).split('.');
//       payload = JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8'));
//       if (payload?.data?.signedTransactionInfo) {
//         const tp = (payload.data.signedTransactionInfo as string).split('.');
//         txInfo = JSON.parse(Buffer.from(tp[1], 'base64url').toString('utf8'));
//       }
//     } catch { return { received: false }; }
//     const { notificationType, subtype } = payload;
//     const txId = txInfo?.originalTransactionId;
//     this.logger.log(`[Apple webhook] ${notificationType}/${subtype} txId=${txId}`);
//     if (!txId) return { received: true };
//     const receipt = await this.prisma.iAPReceipt.findUnique({ where: { transactionId: txId as string } });
//     if (!receipt) return { received: true };
//     const expiresAt = txInfo?.expiresDate ? new Date(Number(txInfo.expiresDate)) : null;
//     if      (notificationType === 'SUBSCRIBED' || notificationType === 'DID_RENEW') await this.activateUser(receipt.userId, expiresAt);
//     else if (notificationType === 'EXPIRED'    || notificationType === 'DID_FAIL_TO_RENEW') await this.deactivateUser(receipt.userId);
//     else if (notificationType === 'REVOKE'     || notificationType === 'REFUND') await this.cancelUser(receipt.userId);
//     else if (notificationType === 'DID_CHANGE_RENEWAL_STATUS' && subtype === 'AUTO_RENEW_DISABLED') {
//       await this.prisma.subscription.updateMany({ where: { iapOriginalTxId: txId as string }, data: { cancelAtPeriodEnd: true } });
//     }
//     return { received: true };
//   }

//   // ── GOOGLE WEBHOOK ────────────────────────────────────────────────────────
//   async handleGoogleWebhook(body: any): Promise<{ received: boolean }> {
//     const msgData = body?.message?.data;
//     if (!msgData) return { received: false };
//     let notification: Record<string, any>;
//     try { notification = JSON.parse(Buffer.from(msgData as string, 'base64').toString('utf8')); }
//     catch { return { received: false }; }
//     const sub = notification?.subscriptionNotification;
//     if (!sub) return { received: true };
//     const { notificationType, purchaseToken } = sub;
//     this.logger.log(`[Google webhook] type=${notificationType}`);
//     const receipt = await this.prisma.iAPReceipt.findFirst({ where: { receiptData: purchaseToken as string, platform: 'GOOGLE' } });
//     if (!receipt) return { received: true };
//     if      ([1,2,4,7].includes(notificationType as number)) await this.refreshGoogleAndActivate(receipt.userId, purchaseToken as string, this.config.get('GOOGLE_PLAY_PACKAGE_NAME') ?? '');
//     else if ([3,13].includes(notificationType as number))   await this.deactivateUser(receipt.userId);
//     else if (notificationType === 12)                        await this.cancelUser(receipt.userId);
//     return { received: true };
//   }

//   // ── PRIVATE HELPERS ───────────────────────────────────────────────────────
//   private buildAppleJWT(): string {
//     const privateKey = (this.config.get<string>('APPLE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');
//     const teamId     = this.config.get<string>('APPLE_TEAM_ID')    ?? '';
//     const keyId      = this.config.get<string>('APPLE_KEY_ID')     ?? '';
//     const bundleId   = this.config.get<string>('APPLE_BUNDLE_ID')  ?? '';
//     if (!privateKey || !teamId || !keyId || !bundleId)
//       throw new InternalServerErrorException('Apple IAP not configured. Set APPLE_BUNDLE_ID/TEAM_ID/KEY_ID/PRIVATE_KEY.');
//     return jwt.sign({ iss: teamId, aud: 'appstoreconnect-v1', bid: bundleId }, privateKey,
//       { algorithm: 'ES256', keyid: keyId, expiresIn: '1h' });
//   }

//   private async getGoogleAccessToken(saJson: string): Promise<string> {
//     let sa: Record<string, any>;
//     try { sa = JSON.parse(saJson); } catch { throw new InternalServerErrorException('GOOGLE_SERVICE_ACCOUNT_JSON is invalid JSON.'); }
//     const now = Math.floor(Date.now() / 1000);
//     const assertion = jwt.sign(
//       { iss: sa.client_email, sub: sa.client_email, aud: 'https://oauth2.googleapis.com/token',
//         scope: 'https://www.googleapis.com/auth/androidpublisher', iat: now, exp: now + 3600 },
//       (sa.private_key as string).replace(/\\n/g, '\n'),
//       { algorithm: 'RS256' },
//     );
//     const res = await fetch('https://oauth2.googleapis.com/token', {
//       method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
//       body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
//       signal: AbortSignal.timeout(10_000),
//     });
//     if (!res.ok) throw new InternalServerErrorException(`Google OAuth failed: ${res.status}. Check service account.`);
//     const data = await res.json() as { access_token: string };
//     return data.access_token;
//   }

//   private async upsertSubscription(p: {
//     userId: string; platform: IAPPlatformType; transactionId: string;
//     productId: string; receiptData: string; serverRaw: string | null;
//     plan: SubscriptionPlan; expiresAt: Date | null; purchasedAt: Date;
//     envStr: string; autoRenewing: boolean | null;
//   }) {
//     await this.prisma.$transaction(async (tx) => {
//       await tx.iAPReceipt.upsert({
//         where:  { transactionId: p.transactionId },
//         create: { userId: p.userId, platform: p.platform, transactionId: p.transactionId,
//           productId: p.productId, receiptData: p.receiptData, verificationRaw: p.serverRaw,
//           isValid: true, environment: p.envStr, purchasedAt: p.purchasedAt, expiresAt: p.expiresAt,
//           ...(p.autoRenewing !== null && { autoRenewing: p.autoRenewing }), plan: p.plan },
//         update: { isValid: true, expiresAt: p.expiresAt, verificationRaw: p.serverRaw,
//           ...(p.autoRenewing !== null && { autoRenewing: p.autoRenewing }) },
//       });
//       await tx.subscription.upsert({
//         where:  { userId: p.userId },
//         create: { userId: p.userId, plan: p.plan, status: SubscriptionStatus.ACTIVE,
//           currentPeriodStart: p.purchasedAt, currentPeriodEnd: p.expiresAt,
//           iapPlatform: p.platform, iapOriginalTxId: p.transactionId, iapProductId: p.productId,
//           iapEnvironment: p.envStr, iapExpiresAt: p.expiresAt,
//           ...(p.autoRenewing !== null && { iapAutoRenewing: p.autoRenewing }) },
//         update: { plan: p.plan, status: SubscriptionStatus.ACTIVE,
//           currentPeriodStart: p.purchasedAt, currentPeriodEnd: p.expiresAt,
//           iapPlatform: p.platform, iapOriginalTxId: p.transactionId, iapProductId: p.productId,
//           iapEnvironment: p.envStr, iapExpiresAt: p.expiresAt,
//           ...(p.autoRenewing !== null && { iapAutoRenewing: p.autoRenewing }),
//           cancelAtPeriodEnd: false, cancelledAt: null },
//       });
//       await tx.user.update({ where: { id: p.userId }, data: { isPremium: p.plan !== SubscriptionPlan.FREE } });
//     });
//   }

//   private async activateUser(userId: string, expiresAt: Date | null) {
//     await this.prisma.subscription.updateMany({ where: { userId },
//       data: { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: expiresAt, iapExpiresAt: expiresAt, cancelAtPeriodEnd: false } });
//     await this.prisma.user.updateMany({ where: { id: userId }, data: { isPremium: true } });
//   }
//   private async deactivateUser(userId: string) {
//     await this.prisma.subscription.updateMany({ where: { userId },
//       data: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.EXPIRED } });
//     await this.prisma.user.updateMany({ where: { id: userId }, data: { isPremium: false } });
//   }
//   private async cancelUser(userId: string) {
//     await this.prisma.subscription.updateMany({ where: { userId },
//       data: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() } });
//     await this.prisma.user.updateMany({ where: { id: userId }, data: { isPremium: false } });
//   }
//   private async refreshGoogleAndActivate(userId: string, purchaseToken: string, packageName: string) {
//     try {
//       const sa    = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '';
//       const token = await this.getGoogleAccessToken(sa);
//       const res   = await fetch(
//         `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`,
//         { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) },
//       );
//       if (res.ok) {
//         const data = await res.json() as Record<string, any>;
//         const exp  = data?.lineItems?.[0]?.expiryTime;
//         await this.activateUser(userId, exp ? new Date(exp as string) : null);
//       }
//     } catch (err: any) { this.logger.error(`[Google webhook] refresh failed: ${err.message}`); }
//   }
// }