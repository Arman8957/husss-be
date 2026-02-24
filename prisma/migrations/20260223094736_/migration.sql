-- AlterTable
ALTER TABLE "program_days" ADD COLUMN     "muscleGroups" "MuscleGroup"[] DEFAULT ARRAY[]::"MuscleGroup"[];

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
