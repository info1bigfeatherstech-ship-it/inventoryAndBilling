-- Shop stock: product_id -> variant_id; ledger variant_id + indexes

ALTER TABLE "shop_stocks" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;
ALTER TABLE "shop_stocks" ADD COLUMN IF NOT EXISTS "low_stock_threshold" INTEGER NOT NULL DEFAULT 5;

UPDATE "shop_stocks" ss
SET "variant_id" = (
  SELECT pv."variant_id"
  FROM "ProductVariant" pv
  WHERE pv."product_id" = ss."product_id"
  ORDER BY pv."is_default" DESC, pv."sort_order" ASC, pv."created_at" ASC
  LIMIT 1
)
WHERE ss."variant_id" IS NULL;

DELETE FROM "shop_stocks" WHERE "variant_id" IS NULL;

ALTER TABLE "shop_stocks" DROP CONSTRAINT IF EXISTS "shop_stocks_product_id_fkey";
ALTER TABLE "shop_stocks" DROP CONSTRAINT IF EXISTS "shop_stocks_shop_id_product_id_key";
DROP INDEX IF EXISTS "shop_stocks_product_id_idx";

ALTER TABLE "shop_stocks" DROP COLUMN IF EXISTS "product_id";
ALTER TABLE "shop_stocks" ALTER COLUMN "variant_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "shop_stocks_shop_id_variant_id_key" ON "shop_stocks"("shop_id", "variant_id");
CREATE INDEX IF NOT EXISTS "shop_stocks_shop_id_quantity_available_idx" ON "shop_stocks"("shop_id", "quantity_available");
CREATE INDEX IF NOT EXISTS "shop_stocks_variant_id_idx" ON "shop_stocks"("variant_id");

ALTER TABLE "shop_stocks"
  ADD CONSTRAINT "shop_stocks_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_ledger" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;

CREATE INDEX IF NOT EXISTS "stock_ledger_variant_id_created_at_idx" ON "stock_ledger"("variant_id", "created_at");
CREATE INDEX IF NOT EXISTS "stock_ledger_from_warehouse_id_created_at_idx" ON "stock_ledger"("from_warehouse_id", "created_at");
CREATE INDEX IF NOT EXISTS "stock_ledger_reference_id_reference_type_idx" ON "stock_ledger"("reference_id", "reference_type");

ALTER TABLE "stock_ledger"
  ADD CONSTRAINT "stock_ledger_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE SET NULL ON UPDATE CASCADE;
