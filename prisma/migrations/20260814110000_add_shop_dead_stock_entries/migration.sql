-- Additive: shop dead stock ledger (Adjust Stock reduces that never return to WH).

CREATE TABLE IF NOT EXISTS "shop_dead_stock_entries" (
    "dead_stock_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "product_code_snapshot" TEXT NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_reduced" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_dead_stock_entries_pkey" PRIMARY KEY ("dead_stock_id")
);

CREATE INDEX IF NOT EXISTS "shop_dead_stock_entries_shop_id_created_at_idx"
  ON "shop_dead_stock_entries"("shop_id", "created_at");

CREATE INDEX IF NOT EXISTS "shop_dead_stock_entries_variant_id_created_at_idx"
  ON "shop_dead_stock_entries"("variant_id", "created_at");

CREATE INDEX IF NOT EXISTS "shop_dead_stock_entries_product_id_created_at_idx"
  ON "shop_dead_stock_entries"("product_id", "created_at");

CREATE INDEX IF NOT EXISTS "shop_dead_stock_entries_created_at_idx"
  ON "shop_dead_stock_entries"("created_at");

DO $$ BEGIN
  ALTER TABLE "shop_dead_stock_entries"
    ADD CONSTRAINT "shop_dead_stock_entries_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_dead_stock_entries"
    ADD CONSTRAINT "shop_dead_stock_entries_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("product_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_dead_stock_entries"
    ADD CONSTRAINT "shop_dead_stock_entries_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shop_dead_stock_entries"
    ADD CONSTRAINT "shop_dead_stock_entries_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
