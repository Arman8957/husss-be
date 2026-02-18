/*
  Warnings:

  - You are about to drop the `audit_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `breathing_exercises` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `feature_flags` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `restricted_apps` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `task_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_tasks` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'TRIALING', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "ProgramDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCE');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('BUILTIN', 'CUSTOM', 'AUTO', 'FREESTYLE', 'ON_THE_FLY');

-- CreateEnum
CREATE TYPE "DaySplitType" AS ENUM ('PUSH_PULL_LEGS', 'UPPER_LOWER', 'FULL_BODY', 'BRO_SPLIT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WorkoutDayType" AS ENUM ('PUSH', 'PULL', 'LEGS', 'UPPER', 'LOWER', 'FULL_BODY', 'REST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WorkoutStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('COMPOUND', 'ISOLATION', 'CARDIO', 'STRETCHING', 'ACTIVATION', 'BFR', 'ABS', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "MuscleGroup" AS ENUM ('CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'LEGS', 'QUADS', 'HAMSTRINGS', 'CALVES', 'GLUTES', 'ABS', 'TRAPS', 'FOREARMS', 'FULL_BODY');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT', 'BANDS', 'KETTLEBELL', 'SMITH_MACHINE', 'NONE');

-- CreateEnum
CREATE TYPE "TrainingMethodType" AS ENUM ('FIVE_BY_FIVE', 'MAX_OT', 'BULLDOZER', 'BURNS', 'GIRONDA_8X8', 'TEN_BY_THREE', 'HIGH_REP_20_REP_SQUAT', 'YATES_HIGH_INTENSITY', 'WESTSIDE_CONJUGATE', 'MODERATE_VOLUME', 'SINGLES_DOUBLES_TRIPLES', 'ACTIVATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SetType" AS ENUM ('NORMAL', 'WARMUP', 'DROP_SET', 'SUPER_SET', 'FAILURE', 'BFR');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'GIF');

-- CreateEnum
CREATE TYPE "AbsWorkoutType" AS ENUM ('TWO_DAY', 'THREE_DAY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CONFIRMED', 'REQUESTED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PENDING_PAR_Q', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SupplementCategory" AS ENUM ('FOUNDATION', 'PERFORMANCE', 'RECOVERY', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "HealthCheckCategory" AS ENUM ('HORMONAL_BALANCE', 'INFLAMMATION_MARKERS', 'NUTRIENT_LEVELS', 'BLOOD_PRESSURE_CARDIOVASCULAR', 'GENERAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('WORKOUT_REMINDER', 'PROGRAM_UPDATE', 'COACH_MESSAGE', 'SESSION_CONFIRMED', 'SESSION_REQUESTED', 'PAR_Q_REVIEW', 'PREMIUM_EXPIRY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "GenderType" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KG', 'LB');

-- CreateEnum
CREATE TYPE "MeasurementUnit" AS ENUM ('CM', 'INCH');

-- CreateEnum
CREATE TYPE "ExerciseTabType" AS ENUM ('MAIN_EXERCISE', 'BFR_EXERCISE', 'ABS_EXERCISE');

-- CreateEnum
CREATE TYPE "BFRContentCategory" AS ENUM ('SAFETY_DISCLAIMER', 'BFR_SESSION', 'RESEARCH_AND_EDUCATION');

-- CreateEnum
CREATE TYPE "BFRSessionCategory" AS ENUM ('HYPERTROPHY', 'STRENGTH', 'ENDURANCE', 'RECOVERY');

-- CreateEnum
CREATE TYPE "BFRBodyType" AS ENUM ('UPPER', 'LOWER', 'FULL_BODY');

-- CreateEnum
CREATE TYPE "ResearchCategory" AS ENUM ('BASIC', 'ADVANCED', 'DETAIL');

-- CreateEnum
CREATE TYPE "NotificationTemplateCategory" AS ENUM ('ENGAGEMENT', 'MOTIVATION', 'MARKETING');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('ALL_USERS', 'PREMIUM_USERS', 'FREE_USERS', 'TRIAL_USERS', 'COACHES', 'COACHED_CLIENTS');

-- CreateEnum
CREATE TYPE "PremiumPlanBillingPeriod" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "HomePageContentType" AS ENUM ('PROGRAM', 'BANNER', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "UserActivityType" AS ENUM ('UPGRADED_TO_PREMIUM', 'ENROLLED_IN_PROGRAM', 'NEW_REGISTRATION', 'COMPLETED_WORKOUT', 'COMPLETED_PROGRAM', 'COACH_JOINED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_EXPIRED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'COACH';

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";

-- DropForeignKey
ALTER TABLE "restricted_apps" DROP CONSTRAINT "restricted_apps_userId_fkey";

-- DropForeignKey
ALTER TABLE "user_tasks" DROP CONSTRAINT "user_tasks_userId_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "gender" "GenderType",
ADD COLUMN     "measureUnit" "MeasurementUnit" NOT NULL DEFAULT 'CM',
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "totalWorkouts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';

-- DropTable
DROP TABLE "audit_logs";

-- DropTable
DROP TABLE "breathing_exercises";

-- DropTable
DROP TABLE "feature_flags";

-- DropTable
DROP TABLE "restricted_apps";

-- DropTable
DROP TABLE "task_templates";

-- DropTable
DROP TABLE "user_tasks";

-- DropEnum
DROP TYPE "TaskFrequency";

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "isCoachPremium" BOOLEAN NOT NULL DEFAULT false,
    "maxClients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "profilePhoto" TEXT,
    "phoneNumber" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "totalClients" INTEGER NOT NULL DEFAULT 0,
    "totalSessionsHeld" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'PENDING_PAR_Q',
    "invitationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_invitations" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parq_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "hasHeartCondition" BOOLEAN NOT NULL,
    "chestPainDuringActivity" BOOLEAN NOT NULL,
    "chestPainAtRest" BOOLEAN NOT NULL,
    "losesBalanceDizziness" BOOLEAN NOT NULL,
    "hasHighBloodPressure" BOOLEAN NOT NULL,
    "doctorLimitedActivity" BOOLEAN NOT NULL,
    "hasBoneJointProblem" BOOLEAN NOT NULL,
    "takingPrescription" BOOLEAN NOT NULL,
    "hasOtherReason" BOOLEAN NOT NULL,
    "otherReasonDetails" TEXT,
    "signature" TEXT,
    "signedAt" TIMESTAMP(3),
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "reviewedByCoachAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parq_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_availability" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "gymName" TEXT,
    "location" TEXT,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_sessions" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "availabilityId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'REQUESTED',
    "sessionType" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_methods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TrainingMethodType" NOT NULL,
    "description" TEXT NOT NULL,
    "setsInfo" TEXT,
    "repRange" TEXT,
    "restPeriod" TEXT,
    "intensity" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProgramType" NOT NULL DEFAULT 'BUILTIN',
    "difficulty" "ProgramDifficulty" NOT NULL DEFAULT 'INTERMEDIATE',
    "durationWeeks" INTEGER NOT NULL,
    "daysPerWeek" INTEGER NOT NULL,
    "daySplitType" "DaySplitType" NOT NULL DEFAULT 'PUSH_PULL_LEGS',
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "thumbnailUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasBFR" BOOLEAN NOT NULL DEFAULT false,
    "hasAbsWorkout" BOOLEAN NOT NULL DEFAULT false,
    "hasActivation" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_weeks" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "program_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_week_training_methods" (
    "id" TEXT NOT NULL,
    "programWeekId" TEXT NOT NULL,
    "trainingMethodId" TEXT NOT NULL,
    "dayType" "WorkoutDayType" NOT NULL,

    CONSTRAINT "program_week_training_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_days" (
    "id" TEXT NOT NULL,
    "programWeekId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "dayType" "WorkoutDayType" NOT NULL,
    "name" TEXT,
    "isRestDay" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "program_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "category" "ExerciseCategory" NOT NULL,
    "primaryMuscle" "MuscleGroup" NOT NULL,
    "secondaryMuscles" "MuscleGroup"[] DEFAULT ARRAY[]::"MuscleGroup"[],
    "equipment" "EquipmentType" NOT NULL DEFAULT 'NONE',
    "thumbnailUrl" TEXT,
    "videoUrl" TEXT,
    "gifUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_day_exercises" (
    "id" TEXT NOT NULL,
    "programDayId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reps" TEXT NOT NULL,
    "restSeconds" INTEGER,
    "setType" "SetType" NOT NULL DEFAULT 'NORMAL',
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isBFR" BOOLEAN NOT NULL DEFAULT false,
    "isAbs" BOOLEAN NOT NULL DEFAULT false,
    "isAccessory" BOOLEAN NOT NULL DEFAULT false,
    "accessoryNote" TEXT,

    CONSTRAINT "program_day_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_active_programs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentWeek" INTEGER NOT NULL DEFAULT 1,
    "currentDay" INTEGER NOT NULL DEFAULT 1,
    "absWorkoutType" "AbsWorkoutType" NOT NULL DEFAULT 'TWO_DAY',
    "bfrEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_active_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_programs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "totalWeeks" INTEGER NOT NULL,
    "completedWeeks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programDayId" TEXT,
    "programId" TEXT,
    "weekNumber" INTEGER,
    "dayNumber" INTEGER,
    "status" "WorkoutStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledDate" DATE NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "notes" TEXT,
    "totalVolume" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sessions" (
    "id" TEXT NOT NULL,
    "workoutLogId" TEXT NOT NULL,
    "programDayId" TEXT,
    "trainingMethodId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_set_logs" (
    "id" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "plannedReps" INTEGER,
    "actualReps" INTEGER,
    "weight" DOUBLE PRECISION,
    "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completionPercent" INTEGER,
    "setType" "SetType" NOT NULL DEFAULT 'NORMAL',
    "restStartedAt" TIMESTAMP(3),
    "restEndedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_set_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_dimensions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weight" DOUBLE PRECISION,
    "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "measureUnit" "MeasurementUnit" NOT NULL DEFAULT 'CM',
    "height" DOUBLE PRECISION,
    "waist" DOUBLE PRECISION,
    "leg" DOUBLE PRECISION,
    "arm" DOUBLE PRECISION,
    "bodyFatPercent" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_reviews" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplements" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SupplementCategory" NOT NULL,
    "description" TEXT,
    "dosage" TEXT NOT NULL,
    "timing" TEXT NOT NULL,
    "notes" TEXT,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_products" (
    "id" TEXT NOT NULL,
    "supplementId" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "affiliateUrl" TEXT NOT NULL,
    "sellerName" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_affiliate_products" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "affiliateProductId" TEXT NOT NULL,
    "customLink" TEXT,
    "commissionRate" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_affiliate_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "affiliateProductId" TEXT NOT NULL,
    "referringCoachId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT,

    CONSTRAINT "affiliate_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_supplement_tracking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supplementId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),

    CONSTRAINT "user_supplement_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protein_calculations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetLeanBodyWeight" DOUBLE PRECISION NOT NULL,
    "weightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "minGrams" DOUBLE PRECISION NOT NULL,
    "maxGrams" DOUBLE PRECISION NOT NULL,
    "goal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protein_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_intake_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "liters" DOUBLE PRECISION NOT NULL,
    "goal" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_intake_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_check_items" (
    "id" TEXT NOT NULL,
    "category" "HealthCheckCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_check_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_clinics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "bookingUrl" TEXT,
    "imageUrl" TEXT,
    "distanceMiles" DOUBLE PRECISION,
    "openingHours" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gyms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "bookingUrl" TEXT,
    "imageUrl" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPartner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_guidelines" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_guidelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essential_contents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "essential_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "altText" TEXT,
    "uploadedBy" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorite_exercises" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_activity_logs" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "group" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_day_exercise_sets" (
    "id" TEXT NOT NULL,
    "programDayExerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "restSeconds" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "program_day_exercise_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_media" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_page_contents" (
    "id" TEXT NOT NULL,
    "type" "HomePageContentType" NOT NULL DEFAULT 'PROGRAM',
    "programId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_page_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "premium_week_lock_configs" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "isPremiumLock" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAdminId" TEXT,

    CONSTRAINT "premium_week_lock_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_notes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "finalMessage" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bfr_contents" (
    "id" TEXT NOT NULL,
    "category" "BFRContentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "richContent" TEXT,
    "finalMessage" TEXT,
    "sessionCategory" "BFRSessionCategory",
    "bodyType" "BFRBodyType",
    "durationMinutes" INTEGER,
    "exerciseCount" INTEGER,
    "researchCategory" "ResearchCategory",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bfr_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_marker_groups" (
    "id" TEXT NOT NULL,
    "category" "HealthCheckCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_marker_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_markers" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "health_markers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SupplementCategory" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "vendorName" TEXT,
    "purchasePageUrl" TEXT NOT NULL,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplement_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "billingPeriod" "PremiumPlanBillingPeriod",
    "priceUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "savingsPercent" INTEGER,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stripePriceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "subscription_plan_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripePaymentId" TEXT,
    "stripeInvoiceId" TEXT,
    "plan" "SubscriptionPlan" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundAmount" DOUBLE PRECISION,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_notification_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "NotificationTemplateCategory" NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduledCron" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "push_notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_blasts" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "audience" "NotificationAudience" NOT NULL DEFAULT 'ALL_USERS',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentByAdminId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_blasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_analytics_snapshots" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "premiumUsers" INTEGER NOT NULL DEFAULT 0,
    "freeUsers" INTEGER NOT NULL DEFAULT 0,
    "trialUsers" INTEGER NOT NULL DEFAULT 0,
    "expiredUsers" INTEGER NOT NULL DEFAULT 0,
    "activeEnrollments" INTEGER NOT NULL DEFAULT 0,
    "totalCoaches" INTEGER NOT NULL DEFAULT 0,
    "coachedClients" INTEGER NOT NULL DEFAULT 0,
    "monthlyRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newUsersToday" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activity_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UserActivityType" NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_analytics" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "totalEnrollments" INTEGER NOT NULL DEFAULT 0,
    "activeEnrollments" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgWeeksCompleted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeCustomerId_key" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_stripeCustomerId_idx" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "coach_profiles_userId_key" ON "coach_profiles"("userId");

-- CreateIndex
CREATE INDEX "coach_profiles_userId_idx" ON "coach_profiles"("userId");

-- CreateIndex
CREATE INDEX "coach_profiles_isVerified_isActive_idx" ON "coach_profiles"("isVerified", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_userId_key" ON "client_profiles"("userId");

-- CreateIndex
CREATE INDEX "client_profiles_coachId_idx" ON "client_profiles"("coachId");

-- CreateIndex
CREATE INDEX "client_profiles_userId_idx" ON "client_profiles"("userId");

-- CreateIndex
CREATE INDEX "client_profiles_status_idx" ON "client_profiles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "coach_invitations_code_key" ON "coach_invitations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coach_invitations_link_key" ON "coach_invitations"("link");

-- CreateIndex
CREATE INDEX "coach_invitations_coachId_idx" ON "coach_invitations"("coachId");

-- CreateIndex
CREATE INDEX "coach_invitations_code_idx" ON "coach_invitations"("code");

-- CreateIndex
CREATE INDEX "coach_invitations_expiresAt_idx" ON "coach_invitations"("expiresAt");

-- CreateIndex
CREATE INDEX "parq_submissions_userId_idx" ON "parq_submissions"("userId");

-- CreateIndex
CREATE INDEX "parq_submissions_clientProfileId_idx" ON "parq_submissions"("clientProfileId");

-- CreateIndex
CREATE INDEX "coach_availability_coachId_idx" ON "coach_availability"("coachId");

-- CreateIndex
CREATE INDEX "coach_availability_date_idx" ON "coach_availability"("date");

-- CreateIndex
CREATE INDEX "coach_availability_isBooked_idx" ON "coach_availability"("isBooked");

-- CreateIndex
CREATE INDEX "coach_sessions_coachId_idx" ON "coach_sessions"("coachId");

-- CreateIndex
CREATE INDEX "coach_sessions_clientProfileId_idx" ON "coach_sessions"("clientProfileId");

-- CreateIndex
CREATE INDEX "coach_sessions_scheduledAt_idx" ON "coach_sessions"("scheduledAt");

-- CreateIndex
CREATE INDEX "coach_sessions_status_idx" ON "coach_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "training_methods_name_key" ON "training_methods"("name");

-- CreateIndex
CREATE INDEX "training_methods_type_idx" ON "training_methods"("type");

-- CreateIndex
CREATE INDEX "programs_type_idx" ON "programs"("type");

-- CreateIndex
CREATE INDEX "programs_isPremium_idx" ON "programs"("isPremium");

-- CreateIndex
CREATE INDEX "programs_isPublished_idx" ON "programs"("isPublished");

-- CreateIndex
CREATE INDEX "program_weeks_programId_idx" ON "program_weeks"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "program_weeks_programId_weekNumber_key" ON "program_weeks"("programId", "weekNumber");

-- CreateIndex
CREATE INDEX "program_week_training_methods_programWeekId_idx" ON "program_week_training_methods"("programWeekId");

-- CreateIndex
CREATE UNIQUE INDEX "program_week_training_methods_programWeekId_dayType_key" ON "program_week_training_methods"("programWeekId", "dayType");

-- CreateIndex
CREATE INDEX "program_days_programWeekId_idx" ON "program_days"("programWeekId");

-- CreateIndex
CREATE UNIQUE INDEX "program_days_programWeekId_dayNumber_key" ON "program_days"("programWeekId", "dayNumber");

-- CreateIndex
CREATE INDEX "exercises_category_idx" ON "exercises"("category");

-- CreateIndex
CREATE INDEX "exercises_primaryMuscle_idx" ON "exercises"("primaryMuscle");

-- CreateIndex
CREATE INDEX "exercises_isPublished_idx" ON "exercises"("isPublished");

-- CreateIndex
CREATE INDEX "program_day_exercises_programDayId_idx" ON "program_day_exercises"("programDayId");

-- CreateIndex
CREATE INDEX "program_day_exercises_exerciseId_idx" ON "program_day_exercises"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "user_active_programs_userId_key" ON "user_active_programs"("userId");

-- CreateIndex
CREATE INDEX "user_active_programs_userId_idx" ON "user_active_programs"("userId");

-- CreateIndex
CREATE INDEX "user_active_programs_programId_idx" ON "user_active_programs"("programId");

-- CreateIndex
CREATE INDEX "user_programs_userId_idx" ON "user_programs"("userId");

-- CreateIndex
CREATE INDEX "user_programs_programId_idx" ON "user_programs"("programId");

-- CreateIndex
CREATE INDEX "workout_logs_userId_idx" ON "workout_logs"("userId");

-- CreateIndex
CREATE INDEX "workout_logs_scheduledDate_idx" ON "workout_logs"("scheduledDate");

-- CreateIndex
CREATE INDEX "workout_logs_status_idx" ON "workout_logs"("status");

-- CreateIndex
CREATE INDEX "workout_logs_programId_idx" ON "workout_logs"("programId");

-- CreateIndex
CREATE INDEX "workout_sessions_workoutLogId_idx" ON "workout_sessions"("workoutLogId");

-- CreateIndex
CREATE INDEX "workout_set_logs_workoutSessionId_idx" ON "workout_set_logs"("workoutSessionId");

-- CreateIndex
CREATE INDEX "workout_set_logs_exerciseId_idx" ON "workout_set_logs"("exerciseId");

-- CreateIndex
CREATE INDEX "body_dimensions_userId_idx" ON "body_dimensions"("userId");

-- CreateIndex
CREATE INDEX "body_dimensions_date_idx" ON "body_dimensions"("date");

-- CreateIndex
CREATE INDEX "program_reviews_programId_idx" ON "program_reviews"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "program_reviews_programId_userId_key" ON "program_reviews"("programId", "userId");

-- CreateIndex
CREATE INDEX "supplements_category_idx" ON "supplements"("category");

-- CreateIndex
CREATE INDEX "affiliate_products_supplementId_idx" ON "affiliate_products"("supplementId");

-- CreateIndex
CREATE INDEX "affiliate_products_isActive_idx" ON "affiliate_products"("isActive");

-- CreateIndex
CREATE INDEX "coach_affiliate_products_coachId_idx" ON "coach_affiliate_products"("coachId");

-- CreateIndex
CREATE UNIQUE INDEX "coach_affiliate_products_coachId_affiliateProductId_key" ON "coach_affiliate_products"("coachId", "affiliateProductId");

-- CreateIndex
CREATE INDEX "affiliate_purchases_userId_idx" ON "affiliate_purchases"("userId");

-- CreateIndex
CREATE INDEX "affiliate_purchases_affiliateProductId_idx" ON "affiliate_purchases"("affiliateProductId");

-- CreateIndex
CREATE INDEX "user_supplement_tracking_userId_idx" ON "user_supplement_tracking"("userId");

-- CreateIndex
CREATE INDEX "protein_calculations_userId_idx" ON "protein_calculations"("userId");

-- CreateIndex
CREATE INDEX "water_intake_logs_userId_idx" ON "water_intake_logs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "water_intake_logs_userId_date_key" ON "water_intake_logs"("userId", "date");

-- CreateIndex
CREATE INDEX "health_check_items_category_idx" ON "health_check_items"("category");

-- CreateIndex
CREATE INDEX "partner_clinics_country_city_idx" ON "partner_clinics"("country", "city");

-- CreateIndex
CREATE INDEX "gyms_city_country_idx" ON "gyms"("city", "country");

-- CreateIndex
CREATE INDEX "gyms_isPartner_idx" ON "gyms"("isPartner");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_url_key" ON "media_assets"("url");

-- CreateIndex
CREATE INDEX "media_assets_type_idx" ON "media_assets"("type");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE INDEX "user_favorite_exercises_userId_idx" ON "user_favorite_exercises"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorite_exercises_userId_exerciseId_key" ON "user_favorite_exercises"("userId", "exerciseId");

-- CreateIndex
CREATE INDEX "admin_activity_logs_adminUserId_idx" ON "admin_activity_logs"("adminUserId");

-- CreateIndex
CREATE INDEX "admin_activity_logs_action_idx" ON "admin_activity_logs"("action");

-- CreateIndex
CREATE INDEX "admin_activity_logs_createdAt_idx" ON "admin_activity_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_configs_key_key" ON "app_configs"("key");

-- CreateIndex
CREATE INDEX "program_day_exercise_sets_programDayExerciseId_idx" ON "program_day_exercise_sets"("programDayExerciseId");

-- CreateIndex
CREATE INDEX "exercise_media_exerciseId_idx" ON "exercise_media"("exerciseId");

-- CreateIndex
CREATE INDEX "home_page_contents_position_idx" ON "home_page_contents"("position");

-- CreateIndex
CREATE INDEX "premium_week_lock_configs_programId_idx" ON "premium_week_lock_configs"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "premium_week_lock_configs_programId_weekNumber_key" ON "premium_week_lock_configs"("programId", "weekNumber");

-- CreateIndex
CREATE INDEX "execution_notes_position_idx" ON "execution_notes"("position");

-- CreateIndex
CREATE INDEX "bfr_contents_category_idx" ON "bfr_contents"("category");

-- CreateIndex
CREATE INDEX "bfr_contents_sessionCategory_idx" ON "bfr_contents"("sessionCategory");

-- CreateIndex
CREATE INDEX "health_marker_groups_category_idx" ON "health_marker_groups"("category");

-- CreateIndex
CREATE INDEX "health_markers_groupId_idx" ON "health_markers"("groupId");

-- CreateIndex
CREATE INDEX "supplement_products_category_idx" ON "supplement_products"("category");

-- CreateIndex
CREATE INDEX "supplement_products_inStock_idx" ON "supplement_products"("inStock");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_configs_plan_key" ON "subscription_plan_configs"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_stripePaymentId_key" ON "payment_transactions"("stripePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_stripeInvoiceId_key" ON "payment_transactions"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "payment_transactions_userId_idx" ON "payment_transactions"("userId");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_createdAt_idx" ON "payment_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "notification_blasts_sentByAdminId_idx" ON "notification_blasts"("sentByAdminId");

-- CreateIndex
CREATE INDEX "notification_blasts_scheduledAt_idx" ON "notification_blasts"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_analytics_snapshots_date_key" ON "platform_analytics_snapshots"("date");

-- CreateIndex
CREATE INDEX "platform_analytics_snapshots_date_idx" ON "platform_analytics_snapshots"("date");

-- CreateIndex
CREATE INDEX "user_activity_logs_userId_idx" ON "user_activity_logs"("userId");

-- CreateIndex
CREATE INDEX "user_activity_logs_type_idx" ON "user_activity_logs"("type");

-- CreateIndex
CREATE INDEX "user_activity_logs_createdAt_idx" ON "user_activity_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "program_analytics_programId_key" ON "program_analytics"("programId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_invitations" ADD CONSTRAINT "coach_invitations_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parq_submissions" ADD CONSTRAINT "parq_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parq_submissions" ADD CONSTRAINT "parq_submissions_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_sessions" ADD CONSTRAINT "coach_sessions_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_sessions" ADD CONSTRAINT "coach_sessions_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_sessions" ADD CONSTRAINT "coach_sessions_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "coach_availability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_weeks" ADD CONSTRAINT "program_weeks_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_week_training_methods" ADD CONSTRAINT "program_week_training_methods_programWeekId_fkey" FOREIGN KEY ("programWeekId") REFERENCES "program_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_week_training_methods" ADD CONSTRAINT "program_week_training_methods_trainingMethodId_fkey" FOREIGN KEY ("trainingMethodId") REFERENCES "training_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_programWeekId_fkey" FOREIGN KEY ("programWeekId") REFERENCES "program_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_day_exercises" ADD CONSTRAINT "program_day_exercises_programDayId_fkey" FOREIGN KEY ("programDayId") REFERENCES "program_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_day_exercises" ADD CONSTRAINT "program_day_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_active_programs" ADD CONSTRAINT "user_active_programs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_active_programs" ADD CONSTRAINT "user_active_programs_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_workoutLogId_fkey" FOREIGN KEY ("workoutLogId") REFERENCES "workout_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_programDayId_fkey" FOREIGN KEY ("programDayId") REFERENCES "program_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_trainingMethodId_fkey" FOREIGN KEY ("trainingMethodId") REFERENCES "training_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_set_logs" ADD CONSTRAINT "workout_set_logs_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "workout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_set_logs" ADD CONSTRAINT "workout_set_logs_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_dimensions" ADD CONSTRAINT "body_dimensions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_reviews" ADD CONSTRAINT "program_reviews_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_reviews" ADD CONSTRAINT "program_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_products" ADD CONSTRAINT "affiliate_products_supplementId_fkey" FOREIGN KEY ("supplementId") REFERENCES "supplements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_affiliate_products" ADD CONSTRAINT "coach_affiliate_products_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_affiliate_products" ADD CONSTRAINT "coach_affiliate_products_affiliateProductId_fkey" FOREIGN KEY ("affiliateProductId") REFERENCES "affiliate_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_purchases" ADD CONSTRAINT "affiliate_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_purchases" ADD CONSTRAINT "affiliate_purchases_affiliateProductId_fkey" FOREIGN KEY ("affiliateProductId") REFERENCES "affiliate_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_supplement_tracking" ADD CONSTRAINT "user_supplement_tracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_supplement_tracking" ADD CONSTRAINT "user_supplement_tracking_supplementId_fkey" FOREIGN KEY ("supplementId") REFERENCES "supplements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protein_calculations" ADD CONSTRAINT "protein_calculations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_intake_logs" ADD CONSTRAINT "water_intake_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_exercises" ADD CONSTRAINT "user_favorite_exercises_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_exercises" ADD CONSTRAINT "user_favorite_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_day_exercise_sets" ADD CONSTRAINT "program_day_exercise_sets_programDayExerciseId_fkey" FOREIGN KEY ("programDayExerciseId") REFERENCES "program_day_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_page_contents" ADD CONSTRAINT "home_page_contents_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premium_week_lock_configs" ADD CONSTRAINT "premium_week_lock_configs_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_markers" ADD CONSTRAINT "health_markers_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "health_marker_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_blasts" ADD CONSTRAINT "notification_blasts_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "push_notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_analytics" ADD CONSTRAINT "program_analytics_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
