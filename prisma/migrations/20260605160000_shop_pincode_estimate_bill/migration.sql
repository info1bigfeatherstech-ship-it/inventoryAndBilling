-- Shop pincode + third bill type (estimate)
ALTER TABLE "shops" ADD COLUMN "pincode" TEXT;

ALTER TYPE "BillType" ADD VALUE 'ESTIMATE_INVOICE';
