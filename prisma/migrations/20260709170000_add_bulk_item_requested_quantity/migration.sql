-- Preserve shop-requested qty separately from warehouse-approved qty.
ALTER TABLE "bulk_transfer_request_items" ADD COLUMN "requested_quantity" INTEGER;

UPDATE "bulk_transfer_request_items"
SET "requested_quantity" = "quantity"
WHERE "requested_quantity" IS NULL;
