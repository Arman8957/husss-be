-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
