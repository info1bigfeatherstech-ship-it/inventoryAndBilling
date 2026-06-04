-- Transfer cost snapshots, ledger valuation, purchase line tax snapshots

ALTER TABLE "transfer_requests" ADD COLUMN IF NOT EXISTS "unit_cost_snapshot" DOUBLE PRECISION;
ALTER TABLE "transfer_requests" ADD COLUMN IF NOT EXISTS "line_value_snapshot" DOUBLE PRECISION;

ALTER TABLE "bulk_transfer_request_items" ADD COLUMN IF NOT EXISTS "unit_cost_snapshot" DOUBLE PRECISION;
ALTER TABLE "bulk_transfer_request_items" ADD COLUMN IF NOT EXISTS "line_value_snapshot" DOUBLE PRECISION;

ALTER TABLE "stock_ledger" ADD COLUMN IF NOT EXISTS "unit_cost" DOUBLE PRECISION;
ALTER TABLE "stock_ledger" ADD COLUMN IF NOT EXISTS "line_value" DOUBLE PRECISION;

ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "line_subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "gst_percent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "purchase_items_variant_id_idx" ON "purchase_items"("variant_id");

DO $$ BEGIN
  ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
