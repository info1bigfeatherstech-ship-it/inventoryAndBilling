/*
  Warnings:

  - The `status` column on the `purchase_entries` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `batch_number` on table `product_stocks` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('WALK_IN', 'ONLINE', 'WHOLESALE', 'MHM', 'OWB', 'OTHER');

-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('GST_INVOICE', 'NON_GST_INVOICE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT_ON_ACCOUNT', 'CREDIT_NOTE_REDEMPTION');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('MRP', 'WHOLESALE', 'RETAIL', 'ONLINE');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'PARTIALLY_REDEEMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseEntryStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');

-- product_stocks.batch_number: PostgreSQL unique treats NULLs as distinct; empty string = one row per (product, warehouse) when no batch.
UPDATE "product_stocks" SET "batch_number" = '' WHERE "batch_number" IS NULL;

-- AlterTable
ALTER TABLE "product_stocks" ALTER COLUMN "batch_number" SET NOT NULL,
ALTER COLUMN "batch_number" SET DEFAULT '';

-- purchase_entries.status: migrate legacy TEXT to enum without dropping column (preserves data).
ALTER TABLE "purchase_entries" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "purchase_entries" ALTER COLUMN "status" TYPE "PurchaseEntryStatus" USING (
  CASE UPPER(TRIM("status"))
    WHEN 'DRAFT' THEN 'DRAFT'::"PurchaseEntryStatus"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"PurchaseEntryStatus"
    WHEN 'RECEIVED' THEN 'RECEIVED'::"PurchaseEntryStatus"
    ELSE 'RECEIVED'::"PurchaseEntryStatus"
  END
);
ALTER TABLE "purchase_entries" ALTER COLUMN "status" SET DEFAULT 'RECEIVED'::"PurchaseEntryStatus";

-- CreateTable
CREATE TABLE "shops" (
    "shop_id" TEXT NOT NULL,
    "shop_code" TEXT NOT NULL,
    "shop_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "owner_user_id" TEXT,
    "sales_channels" "SalesChannel"[] DEFAULT ARRAY[]::"SalesChannel"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("shop_id")
);

-- CreateTable
CREATE TABLE "shop_gst_registrations" (
    "gst_config_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "gst_number" TEXT NOT NULL,
    "legal_name" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_gst_registrations_pkey" PRIMARY KEY ("gst_config_id")
);

-- CreateTable
CREATE TABLE "shop_bank_accounts" (
    "bank_account_id" TEXT NOT NULL,
    "gst_config_id" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch_name" TEXT,
    "account_number" TEXT NOT NULL,
    "ifsc_code" TEXT NOT NULL,
    "upi_id" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_bank_accounts_pkey" PRIMARY KEY ("bank_account_id")
);

-- CreateTable
CREATE TABLE "shop_stocks" (
    "shop_stock_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_available" INTEGER NOT NULL DEFAULT 0,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "quantity_in_transit" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_stocks_pkey" PRIMARY KEY ("shop_stock_id")
);

-- CreateTable
CREATE TABLE "bills" (
    "bill_id" TEXT NOT NULL,
    "bill_number" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "bill_type" "BillType" NOT NULL,
    "customer_mobile" TEXT,
    "customer_name" TEXT,
    "customer_gstin" TEXT,
    "place_of_supply_state_code" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "gst_amount" DOUBLE PRECISION NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "gst_config_id" TEXT,
    "bank_account_id" TEXT,
    "sales_channel" "SalesChannel",
    "pdf_storage_key" TEXT,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("bill_id")
);

-- CreateTable
CREATE TABLE "bill_line_items" (
    "line_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_type" "PriceType" NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "hsn_code" TEXT NOT NULL,
    "line_subtotal" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL,
    "line_total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "bill_line_items_pkey" PRIMARY KEY ("line_id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "credit_note_id" TEXT NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "original_bill_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "customer_mobile" TEXT NOT NULL,
    "customer_name" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "gst_amount" DOUBLE PRECISION NOT NULL,
    "credit_amount" DOUBLE PRECISION NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "redeemed_at" TIMESTAMP(3),
    "redeemed_at_shop_id" TEXT,
    "redeemed_against_bill_id" TEXT,
    "photo_storage_key" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("credit_note_id")
);

-- CreateTable
CREATE TABLE "credit_note_line_items" (
    "line_id" TEXT NOT NULL,
    "credit_note_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "line_total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "credit_note_line_items_pkey" PRIMARY KEY ("line_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_shop_code_key" ON "shops"("shop_code");

-- CreateIndex
CREATE UNIQUE INDEX "shops_owner_user_id_key" ON "shops"("owner_user_id");

-- CreateIndex
CREATE INDEX "shops_city_idx" ON "shops"("city");

-- CreateIndex
CREATE INDEX "shops_is_active_idx" ON "shops"("is_active");

-- CreateIndex
CREATE INDEX "shop_gst_registrations_shop_id_is_active_idx" ON "shop_gst_registrations"("shop_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "shop_gst_registrations_shop_id_gst_number_key" ON "shop_gst_registrations"("shop_id", "gst_number");

-- CreateIndex
CREATE INDEX "shop_bank_accounts_gst_config_id_is_active_idx" ON "shop_bank_accounts"("gst_config_id", "is_active");

-- CreateIndex
CREATE INDEX "shop_stocks_product_id_idx" ON "shop_stocks"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_stocks_shop_id_product_id_key" ON "shop_stocks"("shop_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "bills_bill_number_key" ON "bills"("bill_number");

-- CreateIndex
CREATE INDEX "bills_shop_id_created_at_idx" ON "bills"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "bills_customer_mobile_idx" ON "bills"("customer_mobile");

-- CreateIndex
CREATE INDEX "bill_line_items_bill_id_idx" ON "bill_line_items"("bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_credit_note_number_key" ON "credit_notes"("credit_note_number");

-- CreateIndex
CREATE INDEX "credit_notes_shop_id_status_idx" ON "credit_notes"("shop_id", "status");

-- CreateIndex
CREATE INDEX "credit_notes_customer_mobile_idx" ON "credit_notes"("customer_mobile");

-- CreateIndex
CREATE INDEX "credit_note_line_items_credit_note_id_idx" ON "credit_note_line_items"("credit_note_id");

-- CreateIndex
CREATE INDEX "product_stocks_warehouse_id_product_id_idx" ON "product_stocks"("warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "products_primary_vendor_id_idx" ON "products"("primary_vendor_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE INDEX "purchase_entries_warehouse_id_purchase_date_idx" ON "purchase_entries"("warehouse_id", "purchase_date");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "stock_ledger_from_shop_id_created_at_idx" ON "stock_ledger"("from_shop_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_to_shop_id_created_at_idx" ON "stock_ledger"("to_shop_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_movement_type_created_at_idx" ON "stock_ledger"("movement_type", "created_at");

-- CreateIndex
CREATE INDEX "users_shop_id_idx" ON "users"("shop_id");

-- CreateIndex
CREATE INDEX "users_warehouse_id_idx" ON "users"("warehouse_id");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_gst_registrations" ADD CONSTRAINT "shop_gst_registrations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_bank_accounts" ADD CONSTRAINT "shop_bank_accounts_gst_config_id_fkey" FOREIGN KEY ("gst_config_id") REFERENCES "shop_gst_registrations"("gst_config_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_stocks" ADD CONSTRAINT "shop_stocks_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_stocks" ADD CONSTRAINT "shop_stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entries" ADD CONSTRAINT "purchase_entries_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy `shop_id` values on users/ledger predate `shops` master; clear before shop FKs (re-assign after seeding shops).
UPDATE "users" SET "shop_id" = NULL WHERE "shop_id" IS NOT NULL;
UPDATE "stock_ledger" SET "from_shop_id" = NULL WHERE "from_shop_id" IS NOT NULL;
UPDATE "stock_ledger" SET "to_shop_id" = NULL WHERE "to_shop_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_from_shop_id_fkey" FOREIGN KEY ("from_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_to_shop_id_fkey" FOREIGN KEY ("to_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_gst_config_id_fkey" FOREIGN KEY ("gst_config_id") REFERENCES "shop_gst_registrations"("gst_config_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "shop_bank_accounts"("bank_account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("bill_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_original_bill_id_fkey" FOREIGN KEY ("original_bill_id") REFERENCES "bills"("bill_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_redeemed_at_shop_id_fkey" FOREIGN KEY ("redeemed_at_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_redeemed_against_bill_id_fkey" FOREIGN KEY ("redeemed_against_bill_id") REFERENCES "bills"("bill_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("credit_note_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;
