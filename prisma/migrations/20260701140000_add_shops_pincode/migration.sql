-- Add optional pincode to shops (schema had field; column was never migrated).
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "pincode" TEXT;
