/*
  Warnings:

  - A unique constraint covering the columns `[label]` on the table `training_methods` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "training_methods" ADD COLUMN     "label" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';

-- CreateIndex
CREATE UNIQUE INDEX "training_methods_label_key" ON "training_methods"("label");
