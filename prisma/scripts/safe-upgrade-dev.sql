-- Safe upgrade: inventory_billing_dev -> current schema.prisma
-- Preserves existing row data.

BEGIN;

-- Map legacy role before enum swap (if any rows still use SHOP_STOCK_LISTER)
UPDATE "users" SET "role" = 'SHOP_MANAGER' WHERE "role"::text = 'SHOP_STOCK_LISTER';
UPDATE "backup_records" SET "scope_role" = 'SHOP_MANAGER' WHERE "scope_role"::text = 'SHOP_STOCK_LISTER';

-- UserRole: SHOP_STOCK_LISTER -> SHOP_MANAGER
CREATE TYPE "UserRole_new" AS ENUM (
  'SUPER_ADMIN',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
  'SHOP_OWNER',
  'BILLING_STAFF',
  'SHOP_MANAGER'
);

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING ("role"::text::"UserRole_new");

ALTER TABLE "backup_records"
  ALTER COLUMN "scope_role" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "scope_role" IS NULL THEN NULL
      WHEN "scope_role"::text = 'SHOP_STOCK_LISTER' THEN 'SHOP_MANAGER'::"UserRole_new"
      ELSE "scope_role"::text::"UserRole_new"
    END
  );

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";

COMMIT;

-- 2) Drop obsolete index
DROP INDEX IF EXISTS "shops_shop_type_idx";

-- 3) warranty (nullable)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "warranty" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "warranty" TEXT;

-- 4) wholesale_price: add nullable -> backfill -> NOT NULL
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "wholesale_price" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "wholesale_price" DOUBLE PRECISION;

UPDATE "products"
SET "wholesale_price" = COALESCE("special_price", "mrp", 0)
WHERE "wholesale_price" IS NULL;

UPDATE "ProductVariant"
SET "wholesale_price" = COALESCE("special_price", "mrp", 0)
WHERE "wholesale_price" IS NULL;

ALTER TABLE "products" ALTER COLUMN "wholesale_price" SET NOT NULL;
ALTER TABLE "ProductVariant" ALTER COLUMN "wholesale_price" SET NOT NULL;

-- 5) Company invoice email (optional — stock transfer bill header contact)
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "transfer_invoice_email" TEXT;
