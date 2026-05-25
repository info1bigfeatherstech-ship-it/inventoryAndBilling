-- CreateEnum
CREATE TYPE "TransferRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferRequestType" AS ENUM ('WH_TO_WH', 'WH_TO_SHOP', 'SHOP_TO_SHOP');

-- CreateTable
CREATE TABLE "transfer_requests" (
    "request_id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "request_type" "TransferRequestType" NOT NULL,
    "from_warehouse_id" TEXT,
    "to_warehouse_id" TEXT,
    "from_shop_id" TEXT,
    "to_shop_id" TEXT,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batch_number" TEXT,
    "status" "TransferRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_remarks" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "dispatched_by" TEXT,
    "dispatched_at" TIMESTAMP(3),
    "tracking_number" TEXT,
    "expected_delivery" TIMESTAMP(3),
    "received_by" TEXT,
    "received_at" TIMESTAMP(3),
    "received_quantity" INTEGER,
    "receive_remarks" TEXT,
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfer_requests_request_number_key" ON "transfer_requests"("request_number");

-- CreateIndex
CREATE INDEX "transfer_requests_status_idx" ON "transfer_requests"("status");

-- CreateIndex
CREATE INDEX "transfer_requests_request_type_idx" ON "transfer_requests"("request_type");

-- CreateIndex
CREATE INDEX "transfer_requests_from_warehouse_id_status_idx" ON "transfer_requests"("from_warehouse_id", "status");

-- CreateIndex
CREATE INDEX "transfer_requests_to_shop_id_status_idx" ON "transfer_requests"("to_shop_id", "status");

-- CreateIndex
CREATE INDEX "transfer_requests_requested_by_idx" ON "transfer_requests"("requested_by");

-- CreateIndex
CREATE INDEX "transfer_requests_created_at_idx" ON "transfer_requests"("created_at");

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_shop_id_fkey" FOREIGN KEY ("from_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_shop_id_fkey" FOREIGN KEY ("to_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_dispatched_by_fkey" FOREIGN KEY ("dispatched_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
