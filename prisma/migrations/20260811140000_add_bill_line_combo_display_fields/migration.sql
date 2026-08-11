-- Additive only: invoice display snapshots for combo offers.
-- Existing rows keep combo_applied=false and null combo/special snapshots.

ALTER TABLE "bill_line_items" ADD COLUMN IF NOT EXISTS "special_unit_price" DOUBLE PRECISION;
ALTER TABLE "bill_line_items" ADD COLUMN IF NOT EXISTS "combo_applied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bill_line_items" ADD COLUMN IF NOT EXISTS "combo_unit_price" DOUBLE PRECISION;
