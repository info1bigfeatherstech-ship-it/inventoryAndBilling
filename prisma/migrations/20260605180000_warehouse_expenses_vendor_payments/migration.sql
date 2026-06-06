-- CreateEnum
CREATE TYPE "WarehouseExpenseCategory" AS ENUM ('RENT', 'UTILITIES', 'FREIGHT', 'LABOUR', 'TRANSPORT', 'OFFICE', 'REPAIRS', 'OTHER');

-- CreateEnum
CREATE TYPE "VendorPaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "warehouse_expenses" (
    "expense_id" TEXT NOT NULL,
    "expense_number" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "category" "WarehouseExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "payment_method" "PaymentMethod",
    "reference_no" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "remarks" TEXT,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_expenses_pkey" PRIMARY KEY ("expense_id")
);

-- CreateTable
CREATE TABLE "vendor_payments" (
    "payment_id" TEXT NOT NULL,
    "payment_number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "reference_no" TEXT,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "VendorPaymentStatus" NOT NULL DEFAULT 'PAID',
    "paid_by_user_id" TEXT NOT NULL,
    "remarks" TEXT,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "vendor_payment_allocations" (
    "allocation_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "allocated_amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "vendor_payment_allocations_pkey" PRIMARY KEY ("allocation_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_expenses_expense_number_key" ON "warehouse_expenses"("expense_number");

-- CreateIndex
CREATE INDEX "warehouse_expenses_warehouse_id_expense_date_idx" ON "warehouse_expenses"("warehouse_id", "expense_date");

-- CreateIndex
CREATE INDEX "warehouse_expenses_category_idx" ON "warehouse_expenses"("category");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payments_payment_number_key" ON "vendor_payments"("payment_number");

-- CreateIndex
CREATE INDEX "vendor_payments_warehouse_id_payment_date_idx" ON "vendor_payments"("warehouse_id", "payment_date");

-- CreateIndex
CREATE INDEX "vendor_payments_vendor_id_payment_date_idx" ON "vendor_payments"("vendor_id", "payment_date");

-- CreateIndex
CREATE INDEX "vendor_payments_status_idx" ON "vendor_payments"("status");

-- CreateIndex
CREATE INDEX "vendor_payment_allocations_purchase_id_idx" ON "vendor_payment_allocations"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payment_allocations_payment_id_purchase_id_key" ON "vendor_payment_allocations"("payment_id", "purchase_id");

-- AddForeignKey
ALTER TABLE "warehouse_expenses" ADD CONSTRAINT "warehouse_expenses_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_expenses" ADD CONSTRAINT "warehouse_expenses_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_expenses" ADD CONSTRAINT "warehouse_expenses_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "vendor_payments"("payment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocations_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase_entries"("purchase_id") ON DELETE RESTRICT ON UPDATE CASCADE;
