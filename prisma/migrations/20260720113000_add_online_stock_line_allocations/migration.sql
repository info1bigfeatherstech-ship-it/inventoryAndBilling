-- Additive only: store per-batch reservation allocations for safe release/commit.
ALTER TABLE "online_stock_reservation_lines" ADD COLUMN "allocations" JSONB;
