-- Additive only: shop → warehouse stock returns.
-- Does NOT modify/drop existing business tables or data.
-- Safe for development and production (expand-only).
-- Note: variant table physical name is "ProductVariant" (init migration), not product_variants.

-- MovementType: SHOP_TO_WH (PostgreSQL ADD VALUE is non-destructive)
DO $$ BEGIN
  ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'SHOP_TO_WH';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- StockReturnStatus enum
DO $$ BEGIN
  CREATE TYPE "StockReturnStatus" AS ENUM (
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'DISPATCHED',
    'COMPLETED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "shop_warehouse_returns" (
  "return_id" TEXT NOT NULL,
  "return_number" TEXT NOT NULL,
  "from_shop_id" TEXT NOT NULL,
  "to_warehouse_id" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_bulk_request_id" TEXT,
  "source_transfer_request_id" TEXT,
  "source_bill_number" TEXT,
  "source_reference_number" TEXT,
  "status" "StockReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "return_reason" TEXT,
  "request_remarks" TEXT,
  "requested_by" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "dispatched_by" TEXT,
  "dispatched_at" TIMESTAMP(3),
  "received_by" TEXT,
  "received_at" TIMESTAMP(3),
  "receive_remarks" TEXT,
  "cancelled_by" TEXT,
  "cancelled_at" TIMESTAMP(3),
  "cancel_reason" TEXT,
  "return_bill_type" "TransferBillType",
  "return_bill_number" TEXT,
  "return_bill_generated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shop_warehouse_returns_pkey" PRIMARY KEY ("return_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shop_warehouse_returns_return_number_key"
  ON "shop_warehouse_returns"("return_number");
CREATE UNIQUE INDEX IF NOT EXISTS "shop_warehouse_returns_return_bill_number_key"
  ON "shop_warehouse_returns"("return_bill_number");
CREATE INDEX IF NOT EXISTS "shop_warehouse_returns_status_idx"
  ON "shop_warehouse_returns"("status");
CREATE INDEX IF NOT EXISTS "shop_warehouse_returns_from_shop_id_status_idx"
  ON "shop_warehouse_returns"("from_shop_id", "status");
CREATE INDEX IF NOT EXISTS "shop_warehouse_returns_to_warehouse_id_status_idx"
  ON "shop_warehouse_returns"("to_warehouse_id", "status");
CREATE INDEX IF NOT EXISTS "shop_warehouse_returns_source_bill_number_idx"
  ON "shop_warehouse_returns"("source_bill_number");
CREATE INDEX IF NOT EXISTS "shop_warehouse_returns_source_bulk_request_id_idx"
  ON "shop_warehouse_returns"("source_bulk_request_id");
CREATE INDEX IF NOT EXISTS "shop_warehouse_returns_source_transfer_request_id_idx"
  ON "shop_warehouse_returns"("source_transfer_request_id");
CREATE INDEX IF NOT EXISTS "shop_warehouse_returns_requested_by_idx"
  ON "shop_warehouse_returns"("requested_by");
CREATE INDEX IF NOT EXISTS "shop_warehouse_returns_created_at_idx"
  ON "shop_warehouse_returns"("created_at");

CREATE TABLE IF NOT EXISTS "shop_warehouse_return_items" (
  "return_item_id" TEXT NOT NULL,
  "return_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "source_received_qty" INTEGER NOT NULL,
  "return_quantity" INTEGER NOT NULL,
  "approved_quantity" INTEGER,
  "received_quantity" INTEGER NOT NULL DEFAULT 0,
  "batch_number" TEXT,
  "unit_cost_snapshot" DOUBLE PRECISION,
  "line_cost_snapshot" DOUBLE PRECISION,
  "unit_mrp_snapshot" DOUBLE PRECISION,
  "unit_special_price_snapshot" DOUBLE PRECISION,
  "franchise_unit_price_snapshot" DOUBLE PRECISION,
  "franchise_line_value_snapshot" DOUBLE PRECISION,
  "franchise_markup_percent_snapshot" DOUBLE PRECISION,

  CONSTRAINT "shop_warehouse_return_items_pkey" PRIMARY KEY ("return_item_id")
);

CREATE INDEX IF NOT EXISTS "shop_warehouse_return_items_return_id_idx"
  ON "shop_warehouse_return_items"("return_id");
CREATE INDEX IF NOT EXISTS "shop_warehouse_return_items_variant_id_idx"
  ON "shop_warehouse_return_items"("variant_id");

DO $$ BEGIN
  ALTER TABLE "shop_warehouse_returns"
    ADD CONSTRAINT "shop_warehouse_returns_from_shop_id_fkey"
    FOREIGN KEY ("from_shop_id") REFERENCES "shops"("shop_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_warehouse_returns"
    ADD CONSTRAINT "shop_warehouse_returns_to_warehouse_id_fkey"
    FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("warehouse_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_warehouse_returns"
    ADD CONSTRAINT "shop_warehouse_returns_requested_by_fkey"
    FOREIGN KEY ("requested_by") REFERENCES "users"("user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_warehouse_returns"
    ADD CONSTRAINT "shop_warehouse_returns_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("user_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_warehouse_returns"
    ADD CONSTRAINT "shop_warehouse_returns_dispatched_by_fkey"
    FOREIGN KEY ("dispatched_by") REFERENCES "users"("user_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_warehouse_returns"
    ADD CONSTRAINT "shop_warehouse_returns_received_by_fkey"
    FOREIGN KEY ("received_by") REFERENCES "users"("user_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_warehouse_returns"
    ADD CONSTRAINT "shop_warehouse_returns_cancelled_by_fkey"
    FOREIGN KEY ("cancelled_by") REFERENCES "users"("user_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_warehouse_return_items"
    ADD CONSTRAINT "shop_warehouse_return_items_return_id_fkey"
    FOREIGN KEY ("return_id") REFERENCES "shop_warehouse_returns"("return_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_warehouse_return_items"
    ADD CONSTRAINT "shop_warehouse_return_items_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
