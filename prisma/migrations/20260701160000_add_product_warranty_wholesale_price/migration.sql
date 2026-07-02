-- Product catalog: warranty + wholesale_price (separate from purchase_price).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "wholesale_price" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "warranty" TEXT;

ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "wholesale_price" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "warranty" TEXT;
