-- Additive only: optional company email for transfer bill headers.
-- Safe for existing live data (nullable, no backfill required).
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "transfer_invoice_email" TEXT;
