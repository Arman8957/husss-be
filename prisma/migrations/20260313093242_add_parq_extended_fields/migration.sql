-- AlterTable
ALTER TABLE "parq_submissions" ADD COLUMN     "doctorClearanceFileUrl" TEXT,
ADD COLUMN     "hadSurgeryLast12Months" BOOLEAN,
ADD COLUMN     "hasAsthmaOrRespiratory" BOOLEAN,
ADD COLUMN     "hasDiabetesOrMetabolic" BOOLEAN,
ADD COLUMN     "hasNeurologicalCondition" BOOLEAN,
ADD COLUMN     "isPregnantOrRecentBirth" BOOLEAN,
ADD COLUMN     "prescriptionDetails" TEXT,
ADD COLUMN     "signatureData" TEXT,
ADD COLUMN     "signatureName" TEXT,
ADD COLUMN     "surgeryDetails" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
