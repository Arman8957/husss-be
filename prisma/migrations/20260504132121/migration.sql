-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BFRSessionCategory" ADD VALUE 'CONDITIONING';
ALTER TYPE "BFRSessionCategory" ADD VALUE 'REHAB_STYLE';
ALTER TYPE "BFRSessionCategory" ADD VALUE 'DELOAD';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
