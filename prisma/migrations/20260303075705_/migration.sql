-- AlterTable
ALTER TABLE "essential_contents" ADD COLUMN     "finalMessage" TEXT;

-- AlterTable
ALTER TABLE "supplements" ADD COLUMN     "productPurchesUrl" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
