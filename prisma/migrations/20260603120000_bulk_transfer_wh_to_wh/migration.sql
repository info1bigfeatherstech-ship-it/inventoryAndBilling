-- Bulk transfer: support WH_TO_WH (destination warehouse)
ALTER TABLE "bulk_transfer_requests" ALTER COLUMN "to_shop_id" DROP NOT NULL;

ALTER TABLE "bulk_transfer_requests" ADD COLUMN "to_warehouse_id" TEXT;

CREATE INDEX "bulk_transfer_requests_to_warehouse_id_status_idx"
  ON "bulk_transfer_requests"("to_warehouse_id", "status");

ALTER TABLE "bulk_transfer_requests"
  ADD CONSTRAINT "bulk_transfer_requests_to_warehouse_id_fkey"
  FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("warehouse_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
