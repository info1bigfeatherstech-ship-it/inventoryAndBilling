-- Product-level default prices; variant_code required with serial pattern.

ALTER TABLE "products"
ADD COLUMN "mrp" DOUBLE PRECISION,
ADD COLUMN "wholesale_price" DOUBLE PRECISION,
ADD COLUMN "retail_price" DOUBLE PRECISION,
ADD COLUMN "online_price" DOUBLE PRECISION,
ADD COLUMN "purchase_cost" DOUBLE PRECISION;

UPDATE "products" p
SET
    "mrp" = v."mrp",
    "wholesale_price" = v."wholesale_price",
    "retail_price" = v."retail_price",
    "online_price" = v."online_price",
    "purchase_cost" = v."purchase_cost"
FROM "product_variants" v
WHERE v."product_id" = p."product_id" AND v."is_default" = true;

UPDATE "products" p
SET
    "mrp" = sub."mrp",
    "wholesale_price" = sub."wholesale_price",
    "retail_price" = sub."retail_price",
    "online_price" = sub."online_price",
    "purchase_cost" = sub."purchase_cost"
FROM (
    SELECT DISTINCT ON ("product_id")
        "product_id",
        "mrp",
        "wholesale_price",
        "retail_price",
        "online_price",
        "purchase_cost"
    FROM "product_variants"
    ORDER BY "product_id", "sort_order" ASC, "created_at" ASC
) sub
WHERE p."product_id" = sub."product_id" AND p."mrp" IS NULL;

UPDATE "products"
SET "mrp" = 0, "wholesale_price" = 0, "retail_price" = 0
WHERE "mrp" IS NULL;

ALTER TABLE "products"
ALTER COLUMN "mrp" SET NOT NULL,
ALTER COLUMN "wholesale_price" SET NOT NULL,
ALTER COLUMN "retail_price" SET NOT NULL;

UPDATE "product_variants"
SET "variant_code" = "sku"
WHERE "variant_code" IS NULL OR TRIM("variant_code") = '';

ALTER TABLE "product_variants" ALTER COLUMN "variant_code" SET NOT NULL;

CREATE UNIQUE INDEX "product_variants_product_id_variant_code_key" ON "product_variants"("product_id", "variant_code");
