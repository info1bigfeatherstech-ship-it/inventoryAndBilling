-- Billing staff codes per shop (shared login + per-bill code selection).
CREATE TABLE IF NOT EXISTS "shop_staff_codes" (
    "staff_code_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_staff_codes_pkey" PRIMARY KEY ("staff_code_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shop_staff_codes_shop_id_code_key"
    ON "shop_staff_codes"("shop_id", "code");

CREATE INDEX IF NOT EXISTS "shop_staff_codes_shop_id_is_active_idx"
    ON "shop_staff_codes"("shop_id", "is_active");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'shop_staff_codes_shop_id_fkey'
    ) THEN
        ALTER TABLE "shop_staff_codes"
            ADD CONSTRAINT "shop_staff_codes_shop_id_fkey"
            FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Bill attribution snapshots (safe if columns already exist).
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "staff_code_id" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "staff_code_value" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "staff_name_snapshot" TEXT;

CREATE INDEX IF NOT EXISTS "bills_shop_id_staff_code_value_created_at_idx"
    ON "bills"("shop_id", "staff_code_value", "created_at");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bills_staff_code_id_fkey'
    ) THEN
        ALTER TABLE "bills"
            ADD CONSTRAINT "bills_staff_code_id_fkey"
            FOREIGN KEY ("staff_code_id") REFERENCES "shop_staff_codes"("staff_code_id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
