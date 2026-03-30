-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';

-- CreateTable
CREATE TABLE "HealthClinicChecker" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "items" TEXT[],
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthClinicChecker_pkey" PRIMARY KEY ("id")
);
