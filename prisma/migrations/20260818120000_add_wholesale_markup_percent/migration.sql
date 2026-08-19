-- Additive only. Never DROP or rewrite bills / catalog / existing settings rows.
-- Existing app_settings row gets default 40 (same starting point as franchise markup).

ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "wholesale_markup_percent" DOUBLE PRECISION NOT NULL DEFAULT 40;
