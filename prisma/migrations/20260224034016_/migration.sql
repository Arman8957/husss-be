-- AlterTable
ALTER TABLE "supplements" ADD COLUMN     "productBenefit" TEXT,
ADD COLUMN     "productImage" TEXT,
ADD COLUMN     "productPrice" TEXT,
ADD COLUMN     "vendorname" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "trialEndsAt" SET DEFAULT now() + interval '7 days';
