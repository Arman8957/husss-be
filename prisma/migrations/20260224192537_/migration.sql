-- AlterTable
ALTER TABLE "program_weeks" ADD COLUMN     "accessories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "restDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trainingDays" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "supplements" ALTER COLUMN "dosage" DROP NOT NULL,
ALTER COLUMN "timing" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
