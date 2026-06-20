-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('GST', 'WALK_IN');

-- AlterTable: add customer_type and company_name
ALTER TABLE "customers" ADD COLUMN "customer_type" "CustomerType" NOT NULL DEFAULT 'WALK_IN';
ALTER TABLE "customers" ADD COLUMN "company_name" TEXT;

-- Backfill: existing customers with full GST details become GST type
UPDATE "customers"
SET
  "customer_type" = 'GST',
  "company_name" = COALESCE("company_name", "name")
WHERE
  "gst_number" IS NOT NULL
  AND LENGTH(TRIM("gst_number")) = 15
  AND "address" IS NOT NULL AND TRIM("address") <> ''
  AND "city" IS NOT NULL AND TRIM("city") <> ''
  AND "state_code" IS NOT NULL AND TRIM("state_code") <> ''
  AND "pincode" IS NOT NULL AND TRIM("pincode") <> '';

-- Index for customer_type lookups
CREATE INDEX "customers_customer_type_idx" ON "customers"("customer_type");

-- Rollback instructions (run manually if reverting):
-- DROP INDEX IF EXISTS "customers_customer_type_idx";
-- ALTER TABLE "customers" DROP COLUMN IF EXISTS "company_name";
-- ALTER TABLE "customers" DROP COLUMN IF EXISTS "customer_type";
-- DROP TYPE IF EXISTS "CustomerType";
