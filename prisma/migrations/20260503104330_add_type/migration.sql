-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResearchCategory" ADD VALUE 'SAFETY';
ALTER TYPE "ResearchCategory" ADD VALUE 'PROGRAMMING';
ALTER TYPE "ResearchCategory" ADD VALUE 'RECOVERY';
ALTER TYPE "ResearchCategory" ADD VALUE 'REHAB';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
