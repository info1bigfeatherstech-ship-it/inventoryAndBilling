-- Persist product GST type on each bill line for correct invoice split (CGST/SGST vs IGST).
ALTER TABLE "bill_line_items" ADD COLUMN "gst_type" "GSTType" NOT NULL DEFAULT 'CGST_SGST';
