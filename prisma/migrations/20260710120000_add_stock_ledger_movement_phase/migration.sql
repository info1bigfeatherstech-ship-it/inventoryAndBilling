-- CreateEnum
CREATE TYPE "MovementPhase" AS ENUM ('DISPATCH', 'RECEIVE');

-- AlterTable
ALTER TABLE "stock_ledger" ADD COLUMN "movement_phase" "MovementPhase";

-- Backfill WH→Shop transfer legs (bulk + single request flows)
WITH transfer_rows AS (
  SELECT
    ledger_id,
    from_warehouse_id,
    created_at,
    COUNT(*) OVER (
      PARTITION BY reference_id, reference_type, variant_id
    ) AS leg_count,
    ROW_NUMBER() OVER (
      PARTITION BY reference_id, reference_type, variant_id
      ORDER BY created_at ASC, ledger_id ASC
    ) AS leg_order_asc,
    ROW_NUMBER() OVER (
      PARTITION BY reference_id, reference_type, variant_id
      ORDER BY created_at DESC, ledger_id DESC
    ) AS leg_order_desc
  FROM "stock_ledger"
  WHERE movement_type = 'WH_TO_SHOP'
    AND reference_id IS NOT NULL
)
UPDATE "stock_ledger" sl
SET movement_phase = CASE
  WHEN tr.leg_count = 1 AND tr.from_warehouse_id IS NOT NULL THEN 'DISPATCH'::"MovementPhase"
  WHEN tr.leg_count = 1 AND tr.from_warehouse_id IS NULL THEN 'RECEIVE'::"MovementPhase"
  WHEN tr.leg_order_asc = 1 THEN 'DISPATCH'::"MovementPhase"
  WHEN tr.leg_order_desc = 1 THEN 'RECEIVE'::"MovementPhase"
  ELSE 'DISPATCH'::"MovementPhase"
END
FROM transfer_rows tr
WHERE sl.ledger_id = tr.ledger_id;

-- CreateIndex
CREATE INDEX "stock_ledger_movement_type_movement_phase_reference_id_refer_idx"
ON "stock_ledger"("movement_type", "movement_phase", "reference_id", "reference_type", "variant_id");
