-- Additive migration: optional warehouse GST identity for franchise transfer bills (no data loss)

ALTER TABLE "warehouses"
  ADD COLUMN "gstin" TEXT,
  ADD COLUMN "legal_name" TEXT,
  ADD COLUMN "state_code" TEXT;
