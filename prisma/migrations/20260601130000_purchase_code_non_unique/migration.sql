-- purchase_code is a label obfuscation derived from pricing, not a unique product identifier.
-- Duplicates are allowed across variants and products.

DROP INDEX IF EXISTS "ProductVariant_purchase_code_key";

CREATE INDEX IF NOT EXISTS "ProductVariant_purchase_code_idx" ON "ProductVariant"("purchase_code");

-- Recompute from formula (undo prior migration +1 bumps for duplicate codes)
UPDATE "ProductVariant"
SET "purchase_code" = ROUND("purchase_price" + "expenses" + 1986)::INTEGER;
