-- Add pincode to customer master for billing address
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "pincode" TEXT;
