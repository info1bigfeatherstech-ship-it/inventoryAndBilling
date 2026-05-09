-- Inward scheduling + receiving draft flow before product listing.

-- CreateEnum
CREATE TYPE "InwardStatus" AS ENUM ('SCHEDULED', 'ARRIVED', 'MAPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "inward_receipts" (
    "inward_id" TEXT NOT NULL,
    "inward_number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "status" "InwardStatus" NOT NULL DEFAULT 'SCHEDULED',
    "expected_date" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "vendor_invoice_no" TEXT,
    "challan_no" TEXT,
    "transport_details" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "received_by_user_id" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inward_receipts_pkey" PRIMARY KEY ("inward_id")
);

-- CreateTable
CREATE TABLE "inward_receipt_items" (
    "inward_item_id" TEXT NOT NULL,
    "inward_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_name" TEXT NOT NULL,
    "variant_text" TEXT,
    "quantity_received" INTEGER NOT NULL,
    "purchase_cost" DOUBLE PRECISION,
    "batch_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "room_zone" TEXT,
    "rack_shelf" TEXT,
    "position" TEXT,
    "mapped_product_id" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inward_receipt_items_pkey" PRIMARY KEY ("inward_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inward_receipts_inward_number_key" ON "inward_receipts"("inward_number");

-- CreateIndex
CREATE INDEX "inward_receipts_vendor_id_expected_date_idx" ON "inward_receipts"("vendor_id", "expected_date");

-- CreateIndex
CREATE INDEX "inward_receipts_warehouse_id_status_expected_date_idx" ON "inward_receipts"("warehouse_id", "status", "expected_date");

-- CreateIndex
CREATE INDEX "inward_receipts_status_created_at_idx" ON "inward_receipts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inward_receipt_items_inward_id_line_no_key" ON "inward_receipt_items"("inward_id", "line_no");

-- CreateIndex
CREATE INDEX "inward_receipt_items_mapped_product_id_idx" ON "inward_receipt_items"("mapped_product_id");

-- AddForeignKey
ALTER TABLE "inward_receipts" ADD CONSTRAINT "inward_receipts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipts" ADD CONSTRAINT "inward_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipts" ADD CONSTRAINT "inward_receipts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipts" ADD CONSTRAINT "inward_receipts_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipt_items" ADD CONSTRAINT "inward_receipt_items_inward_id_fkey" FOREIGN KEY ("inward_id") REFERENCES "inward_receipts"("inward_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipt_items" ADD CONSTRAINT "inward_receipt_items_mapped_product_id_fkey" FOREIGN KEY ("mapped_product_id") REFERENCES "products"("product_id") ON DELETE SET NULL ON UPDATE CASCADE;
