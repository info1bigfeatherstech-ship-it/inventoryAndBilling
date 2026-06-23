-- CreateEnum
CREATE TYPE "GSTType" AS ENUM ('CGST_SGST', 'IGST', 'EXEMPT');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RETAILER', 'WHOLESALER', 'IMPORTER', 'EXPORTER', 'DISTRIBUTOR');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE', 'WH_TO_SHOP', 'SHOP_TO_SHOP', 'WH_TO_WH', 'SALES', 'RETURN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_OWNER', 'BILLING_STAFF', 'SHOP_STOCK_LISTER');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('WALK_IN', 'ONLINE', 'WHOLESALE', 'MHM', 'OWB', 'OTHER');

-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('GST_INVOICE', 'NON_GST_INVOICE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT_ON_ACCOUNT', 'CREDIT_NOTE_REDEMPTION');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_PAID', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('MRP', 'SPECIAL', 'WHOLESALE', 'RETAIL', 'ONLINE');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'PARTIALLY_REDEEMED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseEntryStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InwardStatus" AS ENUM ('SCHEDULED', 'ARRIVED', 'MAPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferRequestType" AS ENUM ('WH_TO_WH', 'WH_TO_SHOP', 'SHOP_TO_SHOP');

-- CreateEnum
CREATE TYPE "TransferPriority" AS ENUM ('NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "MediaStorageProvider" AS ENUM ('CLOUDINARY', 'CLOUDFLARE_R2');

-- CreateTable
CREATE TABLE "vendors" (
    "vendor_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "gst_number" TEXT,
    "vendor_type" TEXT,
    "supply_city" TEXT NOT NULL,
    "business_type" "BusinessType" NOT NULL,
    "city" TEXT NOT NULL,
    "state_code" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "warehouse_id" TEXT NOT NULL,
    "warehouse_code" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "manager_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("warehouse_id")
);

-- CreateTable
CREATE TABLE "shops" (
    "shop_id" TEXT NOT NULL,
    "shop_code" TEXT NOT NULL,
    "shop_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state_code" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "owner_user_id" TEXT,
    "sales_channels" "SalesChannel"[] DEFAULT ARRAY[]::"SalesChannel"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("shop_id")
);

-- CreateTable
CREATE TABLE "shop_gst_registrations" (
    "gst_config_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "gst_number" TEXT NOT NULL,
    "legal_name" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_gst_registrations_pkey" PRIMARY KEY ("gst_config_id")
);

-- CreateTable
CREATE TABLE "shop_bank_accounts" (
    "bank_account_id" TEXT NOT NULL,
    "gst_config_id" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch_name" TEXT,
    "account_number" TEXT NOT NULL,
    "ifsc_code" TEXT NOT NULL,
    "upi_id" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_bank_accounts_pkey" PRIMARY KEY ("bank_account_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "title" TEXT,
    "brand_name" TEXT,
    "primary_vendor_id" TEXT NOT NULL,
    "hsn_code" TEXT NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "gst_type" "GSTType" NOT NULL,
    "unit_of_measure" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "sub_category_id" TEXT,
    "mrp" DOUBLE PRECISION NOT NULL,
    "special_price" DOUBLE PRECISION NOT NULL,
    "purchase_price" DOUBLE PRECISION NOT NULL,
    "expenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "variant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "system_barcode" TEXT,
    "vendor_barcode" TEXT,
    "attributes" JSONB,
    "mrp" DOUBLE PRECISION NOT NULL,
    "special_price" DOUBLE PRECISION NOT NULL,
    "purchase_price" DOUBLE PRECISION NOT NULL,
    "expenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchase_code" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 10,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "product_variant_images" (
    "image_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "storage_provider" "MediaStorageProvider" NOT NULL DEFAULT 'CLOUDINARY',
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variant_images_pkey" PRIMARY KEY ("image_id")
);

-- CreateTable
CREATE TABLE "product_stocks" (
    "stock_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER,
    "room_zone" TEXT NOT NULL,
    "rack_shelf" TEXT NOT NULL,
    "position" TEXT,
    "batch_number" TEXT NOT NULL DEFAULT '',
    "expiry_date" TIMESTAMP(3),
    "last_purchase_id" TEXT,
    "last_purchase_date" TIMESTAMP(3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_stocks_pkey" PRIMARY KEY ("stock_id")
);

-- CreateTable
CREATE TABLE "shop_stocks" (
    "shop_stock_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity_available" INTEGER NOT NULL DEFAULT 0,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "quantity_in_transit" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_stocks_pkey" PRIMARY KEY ("shop_stock_id")
);

-- CreateTable
CREATE TABLE "purchase_entries" (
    "purchase_id" TEXT NOT NULL,
    "purchase_number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "vendor_invoice_no" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseEntryStatus" NOT NULL DEFAULT 'RECEIVED',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "received_by" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_entries_pkey" PRIMARY KEY ("purchase_id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "purchase_item_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "purchase_cost" DOUBLE PRECISION NOT NULL,
    "batch_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "room_zone" TEXT NOT NULL,
    "rack_shelf" TEXT NOT NULL,
    "position" TEXT,
    "remarks" TEXT,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("purchase_item_id")
);

-- CreateTable
CREATE TABLE "stock_ledger" (
    "ledger_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "movement_type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "from_warehouse_id" TEXT,
    "to_warehouse_id" TEXT,
    "from_shop_id" TEXT,
    "to_shop_id" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "batch_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("ledger_id")
);

-- CreateTable
CREATE TABLE "customers" (
    "customer_id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "gst_number" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state_code" TEXT,
    "total_spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "last_purchase" TIMESTAMP(3),
    "loyalty_tier" TEXT,
    "credit_limit" DOUBLE PRECISION,
    "credit_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit_used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "bills" (
    "bill_id" TEXT NOT NULL,
    "bill_number" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "bill_type" "BillType" NOT NULL DEFAULT 'GST_INVOICE',
    "customer_mobile" TEXT,
    "customer_name" TEXT,
    "customer_gstin" TEXT,
    "place_of_supply_state_code" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxable_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gst_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_method" "PaymentMethod",
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gst_config_id" TEXT,
    "bank_account_id" TEXT,
    "sales_channel" "SalesChannel" DEFAULT 'WALK_IN',
    "pdf_storage_key" TEXT,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "cancel_reason" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("bill_id")
);

-- CreateTable
CREATE TABLE "bill_line_items" (
    "line_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_type" "PriceType" NOT NULL DEFAULT 'RETAIL',
    "unit_price" DOUBLE PRECISION NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "hsn_code" TEXT NOT NULL,
    "line_subtotal" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxable_amount" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL,
    "line_total" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_line_items_pkey" PRIMARY KEY ("line_id")
);

-- CreateTable
CREATE TABLE "bill_payments" (
    "payment_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "reference_no" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collected_by" TEXT NOT NULL,

    CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "credit_note_id" TEXT NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "original_bill_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_mobile" TEXT NOT NULL,
    "customer_name" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "gst_amount" DOUBLE PRECISION NOT NULL,
    "credit_amount" DOUBLE PRECISION NOT NULL,
    "amount_redeemed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_refunded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "redeemed_at" TIMESTAMP(3),
    "redeemed_at_shop_id" TEXT,
    "redeemed_against_bill_id" TEXT,
    "refunded_at" TIMESTAMP(3),
    "refund_method" "PaymentMethod",
    "refund_reference_no" TEXT,
    "refunded_by_user_id" TEXT,
    "photo_storage_key" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("credit_note_id")
);

-- CreateTable
CREATE TABLE "credit_note_line_items" (
    "line_id" TEXT NOT NULL,
    "credit_note_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "line_subtotal" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL,
    "line_total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "credit_note_line_items_pkey" PRIMARY KEY ("line_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL,
    "warehouse_id" TEXT,
    "shop_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "shop_product_levels" (
    "level_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "min_level" INTEGER NOT NULL,
    "max_level" INTEGER NOT NULL,
    "reorder_qty" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_product_levels_pkey" PRIMARY KEY ("level_id")
);

-- CreateTable
CREATE TABLE "bulk_transfer_requests" (
    "bulk_request_id" TEXT NOT NULL,
    "bulk_request_number" TEXT NOT NULL,
    "request_type" "TransferRequestType" NOT NULL DEFAULT 'WH_TO_SHOP',
    "from_warehouse_id" TEXT,
    "from_shop_id" TEXT,
    "to_shop_id" TEXT NOT NULL,
    "status" "TransferRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_remarks" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "dispatched_by" TEXT,
    "dispatched_at" TIMESTAMP(3),
    "tracking_number" TEXT,
    "expected_delivery" TIMESTAMP(3),
    "received_by" TEXT,
    "received_at" TIMESTAMP(3),
    "receive_remarks" TEXT,
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_transfer_requests_pkey" PRIMARY KEY ("bulk_request_id")
);

-- CreateTable
CREATE TABLE "bulk_transfer_request_items" (
    "bulk_item_id" TEXT NOT NULL,
    "bulk_request_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batch_number" TEXT,
    "is_approved" BOOLEAN NOT NULL DEFAULT true,
    "approved_quantity" INTEGER,
    "rejection_reason" TEXT,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bulk_transfer_request_items_pkey" PRIMARY KEY ("bulk_item_id")
);

-- CreateTable
CREATE TABLE "transfer_requests" (
    "request_id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "request_type" "TransferRequestType" NOT NULL,
    "from_warehouse_id" TEXT,
    "to_warehouse_id" TEXT,
    "from_shop_id" TEXT,
    "to_shop_id" TEXT,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batch_number" TEXT,
    "priority" "TransferPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TransferRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_remarks" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "dispatched_by" TEXT,
    "dispatched_at" TIMESTAMP(3),
    "tracking_number" TEXT,
    "expected_delivery" TIMESTAMP(3),
    "received_by" TEXT,
    "received_at" TIMESTAMP(3),
    "received_quantity" INTEGER,
    "receive_remarks" TEXT,
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "refresh_token_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_jti" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "replaced_by_jti" TEXT,
    "last_used_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("refresh_token_id")
);

-- CreateTable
CREATE TABLE "inward_receipts" (
    "inward_id" TEXT NOT NULL,
    "inward_number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "status" "InwardStatus" NOT NULL DEFAULT 'SCHEDULED',
    "expected_date" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "vendor_invoice_no" TEXT,
    "challan_no" TEXT,
    "transport_details" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "received_by_user_id" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inward_receipts_pkey" PRIMARY KEY ("inward_id")
);

-- CreateTable
CREATE TABLE "inward_receipt_items" (
    "inward_item_id" TEXT NOT NULL,
    "inward_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_name" TEXT NOT NULL,
    "variant_text" TEXT,
    "quantity_received" INTEGER NOT NULL,
    "purchase_cost" DOUBLE PRECISION,
    "batch_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "room_zone" TEXT,
    "rack_shelf" TEXT,
    "position" TEXT,
    "mapped_product_id" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inward_receipt_items_pkey" PRIMARY KEY ("inward_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_phone_key" ON "vendors"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_warehouse_code_key" ON "warehouses"("warehouse_code");

-- CreateIndex
CREATE UNIQUE INDEX "shops_shop_code_key" ON "shops"("shop_code");

-- CreateIndex
CREATE UNIQUE INDEX "shops_owner_user_id_key" ON "shops"("owner_user_id");

-- CreateIndex
CREATE INDEX "shops_city_idx" ON "shops"("city");

-- CreateIndex
CREATE INDEX "shops_is_active_idx" ON "shops"("is_active");

-- CreateIndex
CREATE INDEX "shop_gst_registrations_shop_id_is_active_idx" ON "shop_gst_registrations"("shop_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "shop_gst_registrations_shop_id_gst_number_key" ON "shop_gst_registrations"("shop_id", "gst_number");

-- CreateIndex
CREATE INDEX "shop_bank_accounts_gst_config_id_is_active_idx" ON "shop_bank_accounts"("gst_config_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "products_warehouse_id_is_active_idx" ON "products"("warehouse_id", "is_active");

-- CreateIndex
CREATE INDEX "products_primary_vendor_id_idx" ON "products"("primary_vendor_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_warehouse_id_product_code_key" ON "products"("warehouse_id", "product_code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_product_id_sku_key" ON "ProductVariant"("product_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_product_id_product_code_key" ON "ProductVariant"("product_id", "product_code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_purchase_code_key" ON "ProductVariant"("purchase_code");

-- CreateIndex
CREATE INDEX "product_variant_images_variant_id_sort_order_idx" ON "product_variant_images"("variant_id", "sort_order");

-- CreateIndex
CREATE INDEX "product_stocks_warehouse_id_product_id_idx" ON "product_stocks"("warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "product_stocks_warehouse_id_variant_id_idx" ON "product_stocks"("warehouse_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_stocks_variant_id_warehouse_id_batch_number_key" ON "product_stocks"("variant_id", "warehouse_id", "batch_number");

-- CreateIndex
CREATE INDEX "shop_stocks_shop_id_quantity_available_idx" ON "shop_stocks"("shop_id", "quantity_available");

-- CreateIndex
CREATE INDEX "shop_stocks_variant_id_idx" ON "shop_stocks"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_stocks_shop_id_variant_id_key" ON "shop_stocks"("shop_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_entries_purchase_number_key" ON "purchase_entries"("purchase_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_entries_vendor_invoice_no_key" ON "purchase_entries"("vendor_invoice_no");

-- CreateIndex
CREATE INDEX "purchase_entries_warehouse_id_purchase_date_idx" ON "purchase_entries"("warehouse_id", "purchase_date");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "stock_ledger_product_id_created_at_idx" ON "stock_ledger"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_variant_id_created_at_idx" ON "stock_ledger"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_from_shop_id_created_at_idx" ON "stock_ledger"("from_shop_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_to_shop_id_created_at_idx" ON "stock_ledger"("to_shop_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_from_warehouse_id_created_at_idx" ON "stock_ledger"("from_warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_movement_type_created_at_idx" ON "stock_ledger"("movement_type", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_reference_id_reference_type_idx" ON "stock_ledger"("reference_id", "reference_type");

-- CreateIndex
CREATE UNIQUE INDEX "customers_mobile_key" ON "customers"("mobile");

-- CreateIndex
CREATE INDEX "customers_mobile_idx" ON "customers"("mobile");

-- CreateIndex
CREATE INDEX "customers_loyalty_tier_idx" ON "customers"("loyalty_tier");

-- CreateIndex
CREATE INDEX "customers_state_code_idx" ON "customers"("state_code");

-- CreateIndex
CREATE UNIQUE INDEX "bills_bill_number_key" ON "bills"("bill_number");

-- CreateIndex
CREATE INDEX "bills_shop_id_created_at_idx" ON "bills"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "bills_customer_id_idx" ON "bills"("customer_id");

-- CreateIndex
CREATE INDEX "bills_customer_mobile_idx" ON "bills"("customer_mobile");

-- CreateIndex
CREATE INDEX "bills_bill_number_idx" ON "bills"("bill_number");

-- CreateIndex
CREATE INDEX "bills_is_cancelled_idx" ON "bills"("is_cancelled");

-- CreateIndex
CREATE INDEX "bills_payment_status_idx" ON "bills"("payment_status");

-- CreateIndex
CREATE INDEX "bill_line_items_bill_id_idx" ON "bill_line_items"("bill_id");

-- CreateIndex
CREATE INDEX "bill_line_items_variant_id_idx" ON "bill_line_items"("variant_id");

-- CreateIndex
CREATE INDEX "bill_payments_bill_id_idx" ON "bill_payments"("bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_credit_note_number_key" ON "credit_notes"("credit_note_number");

-- CreateIndex
CREATE INDEX "credit_notes_shop_id_status_idx" ON "credit_notes"("shop_id", "status");

-- CreateIndex
CREATE INDEX "credit_notes_customer_mobile_idx" ON "credit_notes"("customer_mobile");

-- CreateIndex
CREATE INDEX "credit_note_line_items_credit_note_id_idx" ON "credit_note_line_items"("credit_note_id");

-- CreateIndex
CREATE INDEX "credit_note_line_items_variant_id_idx" ON "credit_note_line_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_shop_id_idx" ON "users"("shop_id");

-- CreateIndex
CREATE INDEX "users_warehouse_id_idx" ON "users"("warehouse_id");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "shop_product_levels_shop_id_is_active_idx" ON "shop_product_levels"("shop_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_levels_shop_id_variant_id_key" ON "shop_product_levels"("shop_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_transfer_requests_bulk_request_number_key" ON "bulk_transfer_requests"("bulk_request_number");

-- CreateIndex
CREATE INDEX "bulk_transfer_requests_status_idx" ON "bulk_transfer_requests"("status");

-- CreateIndex
CREATE INDEX "bulk_transfer_requests_request_type_idx" ON "bulk_transfer_requests"("request_type");

-- CreateIndex
CREATE INDEX "bulk_transfer_requests_to_shop_id_status_idx" ON "bulk_transfer_requests"("to_shop_id", "status");

-- CreateIndex
CREATE INDEX "bulk_transfer_requests_requested_by_idx" ON "bulk_transfer_requests"("requested_by");

-- CreateIndex
CREATE INDEX "bulk_transfer_request_items_bulk_request_id_idx" ON "bulk_transfer_request_items"("bulk_request_id");

-- CreateIndex
CREATE INDEX "bulk_transfer_request_items_variant_id_idx" ON "bulk_transfer_request_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_requests_request_number_key" ON "transfer_requests"("request_number");

-- CreateIndex
CREATE INDEX "transfer_requests_status_idx" ON "transfer_requests"("status");

-- CreateIndex
CREATE INDEX "transfer_requests_request_type_idx" ON "transfer_requests"("request_type");

-- CreateIndex
CREATE INDEX "transfer_requests_from_warehouse_id_status_idx" ON "transfer_requests"("from_warehouse_id", "status");

-- CreateIndex
CREATE INDEX "transfer_requests_to_shop_id_status_idx" ON "transfer_requests"("to_shop_id", "status");

-- CreateIndex
CREATE INDEX "transfer_requests_requested_by_idx" ON "transfer_requests"("requested_by");

-- CreateIndex
CREATE INDEX "transfer_requests_created_at_idx" ON "transfer_requests"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_jti_key" ON "refresh_tokens"("token_jti");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "inward_receipts_inward_number_key" ON "inward_receipts"("inward_number");

-- CreateIndex
CREATE INDEX "inward_receipts_vendor_id_expected_date_idx" ON "inward_receipts"("vendor_id", "expected_date");

-- CreateIndex
CREATE INDEX "inward_receipts_warehouse_id_status_expected_date_idx" ON "inward_receipts"("warehouse_id", "status", "expected_date");

-- CreateIndex
CREATE INDEX "inward_receipts_status_created_at_idx" ON "inward_receipts"("status", "created_at");

-- CreateIndex
CREATE INDEX "inward_receipt_items_mapped_product_id_idx" ON "inward_receipt_items"("mapped_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inward_receipt_items_inward_id_line_no_key" ON "inward_receipt_items"("inward_id", "line_no");

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_gst_registrations" ADD CONSTRAINT "shop_gst_registrations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_bank_accounts" ADD CONSTRAINT "shop_bank_accounts_gst_config_id_fkey" FOREIGN KEY ("gst_config_id") REFERENCES "shop_gst_registrations"("gst_config_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_primary_vendor_id_fkey" FOREIGN KEY ("primary_vendor_id") REFERENCES "vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_images" ADD CONSTRAINT "product_variant_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_last_purchase_id_fkey" FOREIGN KEY ("last_purchase_id") REFERENCES "purchase_entries"("purchase_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_stocks" ADD CONSTRAINT "shop_stocks_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_stocks" ADD CONSTRAINT "shop_stocks_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entries" ADD CONSTRAINT "purchase_entries_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entries" ADD CONSTRAINT "purchase_entries_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entries" ADD CONSTRAINT "purchase_entries_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase_entries"("purchase_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_from_shop_id_fkey" FOREIGN KEY ("from_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_to_shop_id_fkey" FOREIGN KEY ("to_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_gst_config_id_fkey" FOREIGN KEY ("gst_config_id") REFERENCES "shop_gst_registrations"("gst_config_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "shop_bank_accounts"("bank_account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("bill_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("bill_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_original_bill_id_fkey" FOREIGN KEY ("original_bill_id") REFERENCES "bills"("bill_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_redeemed_at_shop_id_fkey" FOREIGN KEY ("redeemed_at_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_redeemed_against_bill_id_fkey" FOREIGN KEY ("redeemed_against_bill_id") REFERENCES "bills"("bill_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_refunded_by_user_id_fkey" FOREIGN KEY ("refunded_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("credit_note_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_levels" ADD CONSTRAINT "shop_product_levels_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_levels" ADD CONSTRAINT "shop_product_levels_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_requests" ADD CONSTRAINT "bulk_transfer_requests_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_requests" ADD CONSTRAINT "bulk_transfer_requests_from_shop_id_fkey" FOREIGN KEY ("from_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_requests" ADD CONSTRAINT "bulk_transfer_requests_to_shop_id_fkey" FOREIGN KEY ("to_shop_id") REFERENCES "shops"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_requests" ADD CONSTRAINT "bulk_transfer_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_requests" ADD CONSTRAINT "bulk_transfer_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_requests" ADD CONSTRAINT "bulk_transfer_requests_dispatched_by_fkey" FOREIGN KEY ("dispatched_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_requests" ADD CONSTRAINT "bulk_transfer_requests_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_requests" ADD CONSTRAINT "bulk_transfer_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_request_items" ADD CONSTRAINT "bulk_transfer_request_items_bulk_request_id_fkey" FOREIGN KEY ("bulk_request_id") REFERENCES "bulk_transfer_requests"("bulk_request_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_transfer_request_items" ADD CONSTRAINT "bulk_transfer_request_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_shop_id_fkey" FOREIGN KEY ("from_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_shop_id_fkey" FOREIGN KEY ("to_shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ProductVariant"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_dispatched_by_fkey" FOREIGN KEY ("dispatched_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipts" ADD CONSTRAINT "inward_receipts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipts" ADD CONSTRAINT "inward_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipts" ADD CONSTRAINT "inward_receipts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipts" ADD CONSTRAINT "inward_receipts_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipt_items" ADD CONSTRAINT "inward_receipt_items_inward_id_fkey" FOREIGN KEY ("inward_id") REFERENCES "inward_receipts"("inward_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inward_receipt_items" ADD CONSTRAINT "inward_receipt_items_mapped_product_id_fkey" FOREIGN KEY ("mapped_product_id") REFERENCES "products"("product_id") ON DELETE SET NULL ON UPDATE CASCADE;
