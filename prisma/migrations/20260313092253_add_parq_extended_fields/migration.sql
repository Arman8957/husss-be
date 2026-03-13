-- AlterTable
ALTER TABLE "parq_submissions" ADD COLUMN     "boneJointDetails" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
