-- Move weight/dimensions from product to variant (ecomm shipping per SKU).

ALTER TABLE "product_variants" ADD COLUMN "weight" DOUBLE PRECISION;
ALTER TABLE "product_variants" ADD COLUMN "length" DOUBLE PRECISION;
ALTER TABLE "product_variants" ADD COLUMN "width" DOUBLE PRECISION;
ALTER TABLE "product_variants" ADD COLUMN "height" DOUBLE PRECISION;

UPDATE "product_variants" pv
SET "weight" = p."weight_per_unit"
FROM "products" p
WHERE pv."product_id" = p."product_id"
  AND p."weight_per_unit" IS NOT NULL
  AND pv."weight" IS NULL;

ALTER TABLE "products" DROP COLUMN "weight_per_unit";
