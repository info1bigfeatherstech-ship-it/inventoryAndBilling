-- Purchase Code pricing model: MRP + special_price + purchase_price + expenses + purchase_code

-- Add SPECIAL to PriceType enum (keep legacy values for historical bills)
ALTER TYPE "PriceType" ADD VALUE IF NOT EXISTS 'SPECIAL';

-- Product: add new price columns
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "special_price" DOUBLE PRECISION;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "purchase_price" DOUBLE PRECISION;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "expenses" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill product defaults from legacy columns
UPDATE "products" SET
  "special_price" = COALESCE("special_price", "retail_price", 0),
  "purchase_price" = COALESCE("purchase_price", "purchase_cost", 0),
  "expenses" = COALESCE("expenses", 0);

ALTER TABLE "products" ALTER COLUMN "special_price" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "purchase_price" SET NOT NULL;

-- ProductVariant: add new price columns
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "special_price" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "purchase_price" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "expenses" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "purchase_code" INTEGER;

-- Backfill variant data and compute purchase codes (resolve duplicates by incrementing)
UPDATE "ProductVariant" SET
  "special_price" = COALESCE("special_price", "retail_price", 0),
  "purchase_price" = COALESCE("purchase_price", "purchase_cost", 0),
  "expenses" = COALESCE("expenses", 0);

UPDATE "ProductVariant" pv SET "purchase_code" = sub.computed_code
FROM (
  SELECT
    "variant_id",
    (ROUND(COALESCE("purchase_price", 0) + COALESCE("expenses", 0) + 1986)::INTEGER
      + ROW_NUMBER() OVER (
          PARTITION BY ROUND(COALESCE("purchase_price", 0) + COALESCE("expenses", 0) + 1986)
          ORDER BY "variant_id"
        ) - 1)::INTEGER AS computed_code
  FROM "ProductVariant"
) sub
WHERE pv."variant_id" = sub."variant_id";

ALTER TABLE "ProductVariant" ALTER COLUMN "special_price" SET NOT NULL;
ALTER TABLE "ProductVariant" ALTER COLUMN "purchase_price" SET NOT NULL;
ALTER TABLE "ProductVariant" ALTER COLUMN "purchase_code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_purchase_code_key" ON "ProductVariant"("purchase_code");

-- Drop legacy price columns
ALTER TABLE "products" DROP COLUMN IF EXISTS "wholesale_price";
ALTER TABLE "products" DROP COLUMN IF EXISTS "retail_price";
ALTER TABLE "products" DROP COLUMN IF EXISTS "online_price";
ALTER TABLE "products" DROP COLUMN IF EXISTS "purchase_cost";

ALTER TABLE "ProductVariant" DROP COLUMN IF EXISTS "wholesale_price";
ALTER TABLE "ProductVariant" DROP COLUMN IF EXISTS "retail_price";
ALTER TABLE "ProductVariant" DROP COLUMN IF EXISTS "online_price";
ALTER TABLE "ProductVariant" DROP COLUMN IF EXISTS "purchase_cost";
