-- AlterTable
ALTER TABLE "partner_clinics" ADD COLUMN     "closeTime" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
