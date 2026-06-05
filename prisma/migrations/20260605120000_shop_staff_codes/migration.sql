-- Shop staff codes for shared billing terminal attribution

CREATE TABLE "shop_staff_codes" (
    "staff_code_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_staff_codes_pkey" PRIMARY KEY ("staff_code_id")
);

CREATE UNIQUE INDEX "shop_staff_codes_shop_id_code_key" ON "shop_staff_codes"("shop_id", "code");
CREATE INDEX "shop_staff_codes_shop_id_is_active_idx" ON "shop_staff_codes"("shop_id", "is_active");

ALTER TABLE "shop_staff_codes" ADD CONSTRAINT "shop_staff_codes_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bills" ADD COLUMN "staff_code_id" TEXT;
ALTER TABLE "bills" ADD COLUMN "staff_code_value" TEXT;
ALTER TABLE "bills" ADD COLUMN "staff_name_snapshot" TEXT;

CREATE INDEX "bills_shop_id_staff_code_value_created_at_idx"
    ON "bills"("shop_id", "staff_code_value", "created_at");

ALTER TABLE "bills" ADD CONSTRAINT "bills_staff_code_id_fkey"
    FOREIGN KEY ("staff_code_id") REFERENCES "shop_staff_codes"("staff_code_id") ON DELETE SET NULL ON UPDATE CASCADE;
