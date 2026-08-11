-- Additive only: no data rewrite of existing product/billing rows.
-- Existing variants get combo_eligible = false via column default.

ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "combo_eligible" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "combo_rules" (
    "combo_rule_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "special_price_group" DOUBLE PRECISION NOT NULL,
    "trigger_qty" INTEGER NOT NULL,
    "combo_price" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "combo_rules_pkey" PRIMARY KEY ("combo_rule_id")
);

CREATE INDEX IF NOT EXISTS "combo_rules_is_active_special_price_group_idx"
  ON "combo_rules"("is_active", "special_price_group");
