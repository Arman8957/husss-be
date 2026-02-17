/*
  Warnings:

  - A unique constraint covering the columns `[appleId]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[firebaseUid]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "appleId" TEXT,
ADD COLUMN     "firebaseUid" TEXT,
ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';

-- CreateIndex
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_firebaseUid_key" ON "users"("firebaseUid");
