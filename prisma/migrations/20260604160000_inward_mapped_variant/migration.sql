-- Explicit variant selection on inward item mapping (SKU-level GRN)

ALTER TABLE "inward_receipt_items" ADD COLUMN IF NOT EXISTS "mapped_variant_id" TEXT;

CREATE INDEX IF NOT EXISTS "inward_receipt_items_mapped_variant_id_idx"
  ON "inward_receipt_items"("mapped_variant_id");

ALTER TABLE "inward_receipt_items"
  ADD CONSTRAINT "inward_receipt_items_mapped_variant_id_fkey"
  FOREIGN KEY ("mapped_variant_id") REFERENCES "ProductVariant"("variant_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
