-- CreateEnum
CREATE TYPE "ShopExpenseCategory" AS ENUM ('RENT', 'UTILITIES', 'REPAIRS', 'MAINTENANCE', 'TRANSPORT', 'OFFICE', 'STATIONERY', 'MEALS', 'OTHER');

-- CreateTable
CREATE TABLE "shop_expenses" (
    "expense_id" TEXT NOT NULL,
    "expense_number" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "category" "ShopExpenseCategory" NOT NULL,
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

    CONSTRAINT "shop_expenses_pkey" PRIMARY KEY ("expense_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_expenses_expense_number_key" ON "shop_expenses"("expense_number");

-- CreateIndex
CREATE INDEX "shop_expenses_shop_id_expense_date_idx" ON "shop_expenses"("shop_id", "expense_date");

-- CreateIndex
CREATE INDEX "shop_expenses_category_idx" ON "shop_expenses"("category");

-- AddForeignKey
ALTER TABLE "shop_expenses" ADD CONSTRAINT "shop_expenses_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_expenses" ADD CONSTRAINT "shop_expenses_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_expenses" ADD CONSTRAINT "shop_expenses_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
