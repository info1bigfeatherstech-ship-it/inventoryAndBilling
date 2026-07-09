-- Additive migration: franchise transfer bill at approve (no data loss)

CREATE TYPE "TransferBillType" AS ENUM ('GST_INVOICE', 'NON_GST_INVOICE');

ALTER TABLE "bulk_transfer_requests"
  ADD COLUMN "transfer_bill_type" "TransferBillType",
  ADD COLUMN "transfer_bill_number" TEXT,
  ADD COLUMN "transfer_bill_generated_at" TIMESTAMP(3);

ALTER TABLE "transfer_requests"
  ADD COLUMN "transfer_bill_type" "TransferBillType",
  ADD COLUMN "transfer_bill_number" TEXT,
  ADD COLUMN "transfer_bill_generated_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "bulk_transfer_requests_transfer_bill_number_key"
  ON "bulk_transfer_requests"("transfer_bill_number")
  WHERE "transfer_bill_number" IS NOT NULL;

CREATE UNIQUE INDEX "transfer_requests_transfer_bill_number_key"
  ON "transfer_requests"("transfer_bill_number")
  WHERE "transfer_bill_number" IS NOT NULL;

ALTER TABLE "app_settings"
  ADD COLUMN "transfer_invoice_gstin" TEXT,
  ADD COLUMN "transfer_invoice_legal_name" TEXT,
  ADD COLUMN "transfer_invoice_state_code" TEXT,
  ADD COLUMN "transfer_invoice_address" TEXT,
  ADD COLUMN "transfer_invoice_city" TEXT,
  ADD COLUMN "transfer_invoice_phone" TEXT;
