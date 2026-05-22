-- EMERGENCY ROLLBACK ONLY — run manually if shop_stock migration must be reverted.
-- Backup database before running.

-- Re-add product_id column (data loss for variant mapping unless you backup first)
ALTER TABLE "shop_stocks" ADD COLUMN IF NOT EXISTS "product_id" TEXT;

UPDATE "shop_stocks" ss
SET "product_id" = pv."product_id"
FROM "ProductVariant" pv
WHERE pv."variant_id" = ss."variant_id";

ALTER TABLE "shop_stocks" DROP CONSTRAINT IF EXISTS "shop_stocks_variant_id_fkey";
ALTER TABLE "shop_stocks" DROP CONSTRAINT IF EXISTS "shop_stocks_shop_id_variant_id_key";
DROP INDEX IF EXISTS "shop_stocks_shop_id_quantity_available_idx";

ALTER TABLE "shop_stocks" DROP COLUMN IF EXISTS "variant_id";
ALTER TABLE "shop_stocks" DROP COLUMN IF EXISTS "low_stock_threshold";

CREATE UNIQUE INDEX IF NOT EXISTS "shop_stocks_shop_id_product_id_key" ON "shop_stocks"("shop_id", "product_id");

ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_ledger_variant_id_fkey";
ALTER TABLE "stock_ledger" DROP COLUMN IF EXISTS "variant_id";
