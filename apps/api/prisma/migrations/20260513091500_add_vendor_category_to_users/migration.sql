-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('novo', 'semininovo', 'pdc', 'consorcio', 'assinatura');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "vendor_category" "VendorCategory";
