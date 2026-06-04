-- Debit notes (WH → vendor) and purchase return ledger movement

ALTER TYPE "MovementType" ADD VALUE 'PURCHASE_RETURN';

CREATE TYPE "DebitNoteType" AS ENUM ('SHORTAGE', 'DEFECTIVE', 'RATE_DIFFERENCE', 'OTHER');
CREATE TYPE "DebitNoteStatus" AS ENUM ('ISSUED', 'CANCELLED');

CREATE TABLE "debit_notes" (
    "debit_note_id" TEXT NOT NULL,
    "debit_note_number" TEXT NOT NULL,
    "original_purchase_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "type" "DebitNoteType" NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "gst_amount" DOUBLE PRECISION NOT NULL,
    "debit_amount" DOUBLE PRECISION NOT NULL,
    "return_stock" BOOLEAN NOT NULL DEFAULT false,
    "status" "DebitNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "created_by_user_id" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("debit_note_id")
);

CREATE UNIQUE INDEX "debit_notes_debit_note_number_key" ON "debit_notes"("debit_note_number");
CREATE INDEX "debit_notes_warehouse_id_created_at_idx" ON "debit_notes"("warehouse_id", "created_at");
CREATE INDEX "debit_notes_vendor_id_created_at_idx" ON "debit_notes"("vendor_id", "created_at");
CREATE INDEX "debit_notes_original_purchase_id_idx" ON "debit_notes"("original_purchase_id");
CREATE INDEX "debit_notes_status_idx" ON "debit_notes"("status");

ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_original_purchase_id_fkey" FOREIGN KEY ("original_purchase_id") REFERENCES "purchase_entries"("purchase_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "debit_note_line_items" (
    "line_id" TEXT NOT NULL,
    "debit_note_id" TEXT NOT NULL,
    "purchase_item_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DOUBLE PRECISION NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "line_subtotal" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL,
    "line_total" DOUBLE PRECISION NOT NULL,
    "batch_number" TEXT,

    CONSTRAINT "debit_note_line_items_pkey" PRIMARY KEY ("line_id")
);

CREATE INDEX "debit_note_line_items_debit_note_id_idx" ON "debit_note_line_items"("debit_note_id");
CREATE INDEX "debit_note_line_items_purchase_item_id_idx" ON "debit_note_line_items"("purchase_item_id");
CREATE INDEX "debit_note_line_items_variant_id_idx" ON "debit_note_line_items"("variant_id");

ALTER TABLE "debit_note_line_items" ADD CONSTRAINT "debit_note_line_items_debit_note_id_fkey" FOREIGN KEY ("debit_note_id") REFERENCES "debit_notes"("debit_note_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debit_note_line_items" ADD CONSTRAINT "debit_note_line_items_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("purchase_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_note_line_items" ADD CONSTRAINT "debit_note_line_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_note_line_items" ADD CONSTRAINT "debit_note_line_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;
