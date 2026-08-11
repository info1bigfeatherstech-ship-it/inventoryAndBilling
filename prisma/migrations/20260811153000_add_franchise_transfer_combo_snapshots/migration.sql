-- Additive only: franchise transfer combo display snapshots.
-- Existing rows stay combo_applied=false; money fields unchanged until next approve/dispatch.

ALTER TABLE "bulk_transfer_request_items" ADD COLUMN IF NOT EXISTS "franchise_combo_applied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bulk_transfer_request_items" ADD COLUMN IF NOT EXISTS "franchise_combo_unit_price" DOUBLE PRECISION;
ALTER TABLE "bulk_transfer_request_items" ADD COLUMN IF NOT EXISTS "franchise_combo_units" INTEGER;
ALTER TABLE "bulk_transfer_request_items" ADD COLUMN IF NOT EXISTS "franchise_normal_units" INTEGER;

ALTER TABLE "transfer_requests" ADD COLUMN IF NOT EXISTS "franchise_combo_applied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "transfer_requests" ADD COLUMN IF NOT EXISTS "franchise_combo_unit_price" DOUBLE PRECISION;
ALTER TABLE "transfer_requests" ADD COLUMN IF NOT EXISTS "franchise_combo_units" INTEGER;
ALTER TABLE "transfer_requests" ADD COLUMN IF NOT EXISTS "franchise_normal_units" INTEGER;
