/*
  Warnings:

  - A unique constraint covering the columns `[userId,programId]` on the table `user_active_programs` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user_active_programs" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';

-- CreateIndex
CREATE INDEX "user_active_programs_startedAt_idx" ON "user_active_programs"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_active_programs_userId_programId_key" ON "user_active_programs"("userId", "programId");
