-- Additive only: online stock integration foundation (no data loss).
-- - product_stocks.quantity_reserved (default 0 — existing rows unchanged in behavior)
-- - app_settings.online_warehouse_id (nullable fulfillment WH)
-- - online_stock_reservations + lines for idempotent e-comm holds

-- CreateEnum
CREATE TYPE "OnlineStockReservationStatus" AS ENUM ('HELD', 'COMMITTED', 'RELEASED');

-- AlterTable product_stocks
ALTER TABLE "product_stocks" ADD COLUMN "quantity_reserved" INTEGER NOT NULL DEFAULT 0;

-- AlterTable app_settings
ALTER TABLE "app_settings" ADD COLUMN "online_warehouse_id" TEXT;

-- CreateTable
CREATE TABLE "online_stock_reservations" (
    "reservation_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "storefront" TEXT NOT NULL,
    "status" "OnlineStockReservationStatus" NOT NULL DEFAULT 'HELD',
    "warehouse_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "committed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),

    CONSTRAINT "online_stock_reservations_pkey" PRIMARY KEY ("reservation_id")
);

-- CreateTable
CREATE TABLE "online_stock_reservation_lines" (
    "line_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "online_stock_reservation_lines_pkey" PRIMARY KEY ("line_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_stock_reservations_order_id_key" ON "online_stock_reservations"("order_id");

-- CreateIndex
CREATE INDEX "online_stock_reservations_warehouse_id_status_idx" ON "online_stock_reservations"("warehouse_id", "status");

-- CreateIndex
CREATE INDEX "online_stock_reservation_lines_reservation_id_idx" ON "online_stock_reservation_lines"("reservation_id");

-- CreateIndex
CREATE INDEX "online_stock_reservation_lines_variant_id_idx" ON "online_stock_reservation_lines"("variant_id");

-- CreateIndex
CREATE INDEX "online_stock_reservation_lines_product_code_idx" ON "online_stock_reservation_lines"("product_code");

-- CreateIndex
CREATE INDEX "app_settings_online_warehouse_id_idx" ON "app_settings"("online_warehouse_id");

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_online_warehouse_id_fkey" FOREIGN KEY ("online_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_stock_reservations" ADD CONSTRAINT "online_stock_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_stock_reservation_lines" ADD CONSTRAINT "online_stock_reservation_lines_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "online_stock_reservations"("reservation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_stock_reservation_lines" ADD CONSTRAINT "online_stock_reservation_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
