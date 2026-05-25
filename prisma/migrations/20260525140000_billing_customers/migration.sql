-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_PAID', 'REFUNDED', 'CANCELLED');

-- AlterTable shops
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "state_code" TEXT;

-- AlterTable vendors (if added in schema)
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "state_code" TEXT;

-- CreateTable customers
CREATE TABLE IF NOT EXISTS "customers" (
    "customer_id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "gst_number" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state_code" TEXT,
    "total_spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "last_purchase" TIMESTAMP(3),
    "loyalty_tier" TEXT NOT NULL DEFAULT 'BRONZE',
    "credit_limit" DOUBLE PRECISION,
    "credit_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit_used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("customer_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customers_mobile_key" ON "customers"("mobile");
CREATE INDEX IF NOT EXISTS "customers_mobile_idx" ON "customers"("mobile");
CREATE INDEX IF NOT EXISTS "customers_loyalty_tier_idx" ON "customers"("loyalty_tier");
CREATE INDEX IF NOT EXISTS "customers_state_code_idx" ON "customers"("state_code");

-- AlterTable bills
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "customer_id" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "taxable_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "balance_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;
ALTER TABLE "bills" ALTER COLUMN "payment_method" DROP NOT NULL;
ALTER TABLE "bills" ALTER COLUMN "subtotal" SET DEFAULT 0;
ALTER TABLE "bills" ALTER COLUMN "gst_amount" SET DEFAULT 0;
ALTER TABLE "bills" ALTER COLUMN "total_amount" SET DEFAULT 0;
ALTER TABLE "bills" ALTER COLUMN "bill_type" SET DEFAULT 'GST_INVOICE';

CREATE INDEX IF NOT EXISTS "bills_customer_id_idx" ON "bills"("customer_id");
CREATE INDEX IF NOT EXISTS "bills_bill_number_idx" ON "bills"("bill_number");
CREATE INDEX IF NOT EXISTS "bills_is_cancelled_idx" ON "bills"("is_cancelled");
CREATE INDEX IF NOT EXISTS "bills_payment_status_idx" ON "bills"("payment_status");

-- AlterTable bill_line_items
ALTER TABLE "bill_line_items" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;
ALTER TABLE "bill_line_items" ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bill_line_items" ADD COLUMN IF NOT EXISTS "taxable_amount" DOUBLE PRECISION;
ALTER TABLE "bill_line_items" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "bill_line_items" SET "taxable_amount" = COALESCE("line_subtotal", 0) - COALESCE("discount", 0) WHERE "taxable_amount" IS NULL;

-- CreateTable bill_payments
CREATE TABLE IF NOT EXISTS "bill_payments" (
    "payment_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "reference_no" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collected_by" TEXT NOT NULL,
    CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("payment_id")
);

CREATE INDEX IF NOT EXISTS "bill_payments_bill_id_idx" ON "bill_payments"("bill_id");

-- AlterTable credit_notes
ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "customer_id" TEXT;

-- ForeignKeys
ALTER TABLE "bills" ADD CONSTRAINT "bills_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("bill_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;
