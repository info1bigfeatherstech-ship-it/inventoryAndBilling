-- Additive only — company email for transfer bill headers (nullable).
-- Safe on live DBs that already ran migrate deploy for 20260723104500 (no-op via IF NOT EXISTS).
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "transfer_invoice_email" TEXT;
