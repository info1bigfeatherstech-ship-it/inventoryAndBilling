-- Production-safe schema upgrade (old DB -> current schema.prisma)
-- Run AFTER pg_dump backup. Review in staging first.
--
-- Usage (psql):
--   psql -U postgres -d YOUR_DB -f prisma/scripts/safe-upgrade-dev.sql
--
-- Or pgAdmin: open Query Tool and execute this file.

BEGIN;

-- Map legacy role before enum swap (if any rows still use SHOP_STOCK_LISTER)
UPDATE "users" SET "role" = 'SHOP_MANAGER' WHERE "role"::text = 'SHOP_STOCK_LISTER';
UPDATE "backup_records" SET "scope_role" = 'SHOP_MANAGER' WHERE "scope_role"::text = 'SHOP_STOCK_LISTER';

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

DROP INDEX IF EXISTS "shops_shop_type_idx";

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "warranty" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "warranty" TEXT;

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
