-- Additive only: CREATE TABLE. Never DROP or rewrite catalog / billing prices.

CREATE TABLE IF NOT EXISTS "sale_deals" (
    "sale_deal_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "sale_price" DOUBLE PRECISION NOT NULL,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_deals_pkey" PRIMARY KEY ("sale_deal_id")
);

CREATE INDEX IF NOT EXISTS "sale_deals_variant_id_is_active_idx"
  ON "sale_deals"("variant_id", "is_active");

CREATE INDEX IF NOT EXISTS "sale_deals_is_active_expires_at_idx"
  ON "sale_deals"("is_active", "expires_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_deals_variant_id_fkey'
  ) THEN
    ALTER TABLE "sale_deals"
      ADD CONSTRAINT "sale_deals_variant_id_fkey"
      FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_deals_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE "sale_deals"
      ADD CONSTRAINT "sale_deals_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
