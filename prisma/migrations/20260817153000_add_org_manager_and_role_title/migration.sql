-- Additive only. Never DROP, never rewrite users / shops / bills / catalog.

-- 1) New org-level role. Re-runnable. Do not use ORG_MANAGER in this same transaction.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'UserRole'
      AND e.enumlabel = 'ORG_MANAGER'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'ORG_MANAGER';
  END IF;
END
$$;

-- 2) Optional display title. Existing rows remain NULL (UI falls back to "Org Manager").
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role_title" TEXT;
