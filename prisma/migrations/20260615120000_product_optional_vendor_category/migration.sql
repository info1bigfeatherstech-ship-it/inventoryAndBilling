-- Make vendor and category optional on products (fill later via update / bulk).

ALTER TABLE "products" ALTER COLUMN "primary_vendor_id" DROP NOT NULL;
ALTER TABLE "products" ALTER COLUMN "category_id" DROP NOT NULL;
