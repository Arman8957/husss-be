-- AlterTable
ALTER TABLE "client_profiles" ADD COLUMN     "gymLocation" TEXT,
ADD COLUMN     "gymName" TEXT;

-- AlterTable
ALTER TABLE "coach_profiles" ADD COLUMN     "gymLocation" TEXT,
ADD COLUMN     "gymName" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
