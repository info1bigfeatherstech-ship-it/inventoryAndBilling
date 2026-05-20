-- Warehouse-scoped products with variants (barcode/pricing on variant).

-- 1) Variant tables
CREATE TABLE "product_variants" (
    "variant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "variant_code" TEXT,
    "system_barcode" TEXT NOT NULL,
    "vendor_barcode" TEXT,
    "attributes" JSONB,
    "mrp" DOUBLE PRECISION NOT NULL,
    "wholesale_price" DOUBLE PRECISION NOT NULL,
    "retail_price" DOUBLE PRECISION NOT NULL,
    "online_price" DOUBLE PRECISION,
    "purchase_cost" DOUBLE PRECISION,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 10,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("variant_id")
);

CREATE TABLE "product_variant_images" (
    "image_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variant_images_pkey" PRIMARY KEY ("image_id")
);

-- 2) Warehouse scope on products
ALTER TABLE "products" ADD COLUMN "warehouse_id" TEXT;

UPDATE "products" p
SET "warehouse_id" = sub.warehouse_id
FROM (
    SELECT DISTINCT ON (ps.product_id) ps.product_id, ps.warehouse_id
    FROM "product_stocks" ps
    ORDER BY ps.product_id, ps.created_at ASC
) sub
WHERE p.product_id = sub.product_id AND p.warehouse_id IS NULL;

UPDATE "products"
SET "warehouse_id" = (SELECT w.warehouse_id FROM "warehouses" w WHERE w.is_active = true ORDER BY w.created_at ASC LIMIT 1)
WHERE "warehouse_id" IS NULL;

-- 3) Migrate legacy product barcode/pricing into default variants
INSERT INTO "product_variants" (
    "variant_id",
    "product_id",
    "sku",
    "variant_code",
    "system_barcode",
    "vendor_barcode",
    "attributes",
    "mrp",
    "wholesale_price",
    "retail_price",
    "online_price",
    "purchase_cost",
    "low_stock_threshold",
    "sort_order",
    "is_default",
    "is_active",
    "remarks",
    "created_at",
    "updated_at"
)
SELECT
    'var_' || p."product_id",
    p."product_id",
    COALESCE(NULLIF(TRIM(p."product_code"), ''), p."product_id") || '-DEFAULT',
    p."product_code",
    p."system_barcode",
    p."vendor_barcode",
    NULL,
    p."mrp",
    p."wholesale_price",
    p."retail_price",
    p."online_price",
    p."purchase_cost",
    p."low_stock_threshold",
    0,
    true,
    p."is_active",
    p."remarks",
    p."created_at",
    p."updated_at"
FROM "products" p
WHERE NOT EXISTS (
    SELECT 1 FROM "product_variants" v WHERE v."product_id" = p."product_id"
);

-- 4) Link stock rows to variants
ALTER TABLE "product_stocks" ADD COLUMN "variant_id" TEXT;

UPDATE "product_stocks" ps
SET "variant_id" = v."variant_id"
FROM "product_variants" v
WHERE v."product_id" = ps."product_id" AND v."is_default" = true AND ps."variant_id" IS NULL;

ALTER TABLE "product_stocks" ALTER COLUMN "variant_id" SET NOT NULL;

-- 5) Drop legacy product columns and global uniques
DROP INDEX IF EXISTS "products_product_code_key";
DROP INDEX IF EXISTS "products_system_barcode_key";
DROP INDEX IF EXISTS "products_vendor_barcode_key";

ALTER TABLE "products" DROP COLUMN "image_filenames",
DROP COLUMN "system_barcode",
DROP COLUMN "vendor_barcode",
DROP COLUMN "mrp",
DROP COLUMN "wholesale_price",
DROP COLUMN "retail_price",
DROP COLUMN "online_price",
DROP COLUMN "purchase_cost",
DROP COLUMN "low_stock_threshold";

ALTER TABLE "products" ALTER COLUMN "warehouse_id" SET NOT NULL;

DROP INDEX IF EXISTS "product_stocks_product_id_warehouse_id_batch_number_key";

CREATE UNIQUE INDEX "products_warehouse_id_product_code_key" ON "products"("warehouse_id", "product_code");
CREATE INDEX "products_warehouse_id_is_active_idx" ON "products"("warehouse_id", "is_active");

CREATE UNIQUE INDEX "product_variants_product_id_sku_key" ON "product_variants"("product_id", "sku");
CREATE UNIQUE INDEX "product_variants_system_barcode_key" ON "product_variants"("system_barcode");
CREATE UNIQUE INDEX "product_variants_vendor_barcode_key" ON "product_variants"("vendor_barcode");
CREATE INDEX "product_variants_product_id_is_active_idx" ON "product_variants"("product_id", "is_active");

CREATE INDEX "product_variant_images_variant_id_sort_order_idx" ON "product_variant_images"("variant_id", "sort_order");

CREATE UNIQUE INDEX "product_stocks_variant_id_warehouse_id_batch_number_key" ON "product_stocks"("variant_id", "warehouse_id", "batch_number");
CREATE INDEX "product_stocks_warehouse_id_variant_id_idx" ON "product_stocks"("warehouse_id", "variant_id");

ALTER TABLE "products" ADD CONSTRAINT "products_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_variant_images" ADD CONSTRAINT "product_variant_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
