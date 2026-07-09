-- Franchise markup settings (singleton) + transfer line snapshots.
-- Additive only — does not modify products or product_variants.

CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "franchise_markup_percent" INTEGER NOT NULL DEFAULT 40,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "app_settings" ("id", "franchise_markup_percent", "created_at", "updated_at")
VALUES ('default', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "transfer_requests" ADD COLUMN "franchise_markup_percent_snapshot" DOUBLE PRECISION,
ADD COLUMN "franchise_mrp_snapshot" DOUBLE PRECISION,
ADD COLUMN "franchise_unit_price_snapshot" DOUBLE PRECISION,
ADD COLUMN "franchise_line_value_snapshot" DOUBLE PRECISION;

ALTER TABLE "bulk_transfer_request_items" ADD COLUMN "franchise_markup_percent_snapshot" DOUBLE PRECISION,
ADD COLUMN "franchise_mrp_snapshot" DOUBLE PRECISION,
ADD COLUMN "franchise_unit_price_snapshot" DOUBLE PRECISION,
ADD COLUMN "franchise_line_value_snapshot" DOUBLE PRECISION;
