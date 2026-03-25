-- CreateEnum
CREATE TYPE "IAPPlatform" AS ENUM ('APPLE', 'GOOGLE');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "iapAutoRenewing" BOOLEAN,
ADD COLUMN     "iapEnvironment" TEXT,
ADD COLUMN     "iapExpiresAt" TIMESTAMP(3),
ADD COLUMN     "iapOriginalTxId" TEXT,
ADD COLUMN     "iapPlatform" "IAPPlatform",
ADD COLUMN     "iapProductId" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';

-- CreateTable
CREATE TABLE "iap_receipts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "IAPPlatform" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "receiptData" TEXT NOT NULL,
    "verificationRaw" TEXT,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "autoRenewing" BOOLEAN,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "subscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iap_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iap_receipts_transactionId_key" ON "iap_receipts"("transactionId");

-- CreateIndex
CREATE INDEX "iap_receipts_userId_idx" ON "iap_receipts"("userId");

-- CreateIndex
CREATE INDEX "iap_receipts_platform_transactionId_idx" ON "iap_receipts"("platform", "transactionId");

-- AddForeignKey
ALTER TABLE "iap_receipts" ADD CONSTRAINT "iap_receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iap_receipts" ADD CONSTRAINT "iap_receipts_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
