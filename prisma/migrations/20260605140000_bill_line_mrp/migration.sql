-- Snapshot MRP on bill lines for GST invoice PDF display
ALTER TABLE "bill_line_items" ADD COLUMN "mrp_unit_price" DOUBLE PRECISION;
