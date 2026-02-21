-- AlterEnum
ALTER TYPE "UserActivityType" ADD VALUE 'LOGIN_FAILED';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
