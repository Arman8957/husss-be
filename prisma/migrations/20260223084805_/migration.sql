-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProgramType" ADD VALUE 'ACTIVE';
ALTER TYPE "ProgramType" ADD VALUE 'DRAFT';
ALTER TYPE "ProgramType" ADD VALUE 'AA';

-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "accessories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dayFocus" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "restDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trainingDays" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
