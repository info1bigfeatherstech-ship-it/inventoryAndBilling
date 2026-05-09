-- Split generic STOCK_LISTER into warehouse/shop specific roles.
-- Mapping strategy:
-- 1) warehouse assigned -> WH_STOCK_LISTER
-- 2) else shop assigned -> SHOP_STOCK_LISTER
-- 3) else default -> WH_STOCK_LISTER (operational fallback)

ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM (
  'SUPER_ADMIN',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
  'SHOP_OWNER',
  'BILLING_STAFF',
  'SHOP_STOCK_LISTER'
);

ALTER TABLE "users"
ALTER COLUMN "role" TYPE "UserRole"
USING (
  CASE
    WHEN role::text = 'STOCK_LISTER' AND warehouse_id IS NOT NULL THEN 'WH_STOCK_LISTER'::"UserRole"
    WHEN role::text = 'STOCK_LISTER' AND shop_id IS NOT NULL THEN 'SHOP_STOCK_LISTER'::"UserRole"
    WHEN role::text = 'STOCK_LISTER' THEN 'WH_STOCK_LISTER'::"UserRole"
    ELSE role::text::"UserRole"
  END
);

DROP TYPE "UserRole_old";
