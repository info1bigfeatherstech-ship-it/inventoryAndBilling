-- CreateTable
CREATE TABLE "credit_note_redemptions" (
    "redemption_id" TEXT NOT NULL,
    "credit_note_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "redeemed_at_shop_id" TEXT NOT NULL,
    "against_bill_id" TEXT,
    "redeemed_by_user_id" TEXT NOT NULL,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_note_redemptions_pkey" PRIMARY KEY ("redemption_id")
);

-- CreateIndex
CREATE INDEX "credit_note_redemptions_credit_note_id_redeemed_at_idx" ON "credit_note_redemptions"("credit_note_id", "redeemed_at");

-- CreateIndex
CREATE INDEX "credit_note_redemptions_redeemed_at_shop_id_idx" ON "credit_note_redemptions"("redeemed_at_shop_id");

-- AddForeignKey
ALTER TABLE "credit_note_redemptions" ADD CONSTRAINT "credit_note_redemptions_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("credit_note_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_redemptions" ADD CONSTRAINT "credit_note_redemptions_redeemed_at_shop_id_fkey" FOREIGN KEY ("redeemed_at_shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_redemptions" ADD CONSTRAINT "credit_note_redemptions_against_bill_id_fkey" FOREIGN KEY ("against_bill_id") REFERENCES "bills"("bill_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_redemptions" ADD CONSTRAINT "credit_note_redemptions_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
