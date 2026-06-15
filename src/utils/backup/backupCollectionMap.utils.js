/**
 * Maps backup ZIP collection names → Prisma delegate + primary key field.
 */

const COLLECTION_MAP = {
  categories: { model: 'category', idField: 'category_id' },
  vendors: { model: 'vendor', idField: 'vendor_id' },
  warehouses: { model: 'warehouse', idField: 'warehouse_id' },
  shops: { model: 'shop', idField: 'shop_id' },
  products: { model: 'product', idField: 'product_id' },
  product_variants: { model: 'productVariant', idField: 'variant_id' },
  product_variant_images: { model: 'productVariantImage', idField: 'image_id' },
  shop_gst_registrations: { model: 'shopGstRegistration', idField: 'gst_config_id' },
  shop_bank_accounts: { model: 'shopBankAccount', idField: 'bank_account_id' },
  shop_staff_codes: { model: 'shopStaffCode', idField: 'staff_code_id' },
  customers: { model: 'customer', idField: 'customer_id' },
  product_stocks: { model: 'productStock', idField: 'stock_id' },
  shop_stocks: { model: 'shopStock', idField: 'shop_stock_id' },
  shop_product_levels: { model: 'shopProductLevel', idField: 'level_id' },
  purchase_entries: { model: 'purchaseEntry', idField: 'purchase_id' },
  purchase_items: { model: 'purchaseItem', idField: 'purchase_item_id' },
  warehouse_expenses: { model: 'warehouseExpense', idField: 'expense_id' },
  shop_expenses: { model: 'shopExpense', idField: 'expense_id' },
  vendor_payments: { model: 'vendorPayment', idField: 'payment_id' },
  vendor_payment_allocations: { model: 'vendorPaymentAllocation', idField: 'allocation_id' },
  inward_receipts: { model: 'inwardReceipt', idField: 'inward_id' },
  inward_receipt_items: { model: 'inwardReceiptItem', idField: 'inward_item_id' },
  debit_notes: { model: 'debitNote', idField: 'debit_note_id' },
  debit_note_line_items: { model: 'debitNoteLineItem', idField: 'line_id' },
  bills: { model: 'bill', idField: 'bill_id' },
  bill_line_items: { model: 'billLineItem', idField: 'line_id' },
  bill_payments: { model: 'billPayment', idField: 'payment_id' },
  credit_notes: { model: 'creditNote', idField: 'credit_note_id' },
  credit_note_line_items: { model: 'creditNoteLineItem', idField: 'line_id' },
  credit_note_redemptions: { model: 'creditNoteRedemption', idField: 'redemption_id' },
  transfer_requests: { model: 'transferRequest', idField: 'request_id' },
  bulk_transfer_requests: { model: 'bulkTransferRequest', idField: 'bulk_request_id' },
  bulk_transfer_request_items: { model: 'bulkTransferRequestItem', idField: 'bulk_item_id' },
  stock_ledgers: { model: 'stockLedger', idField: 'ledger_id' },
  users: { model: 'user', idField: 'user_id' },
};

const getCollectionMeta = (collectionName) => COLLECTION_MAP[collectionName] || null;

module.exports = {
  COLLECTION_MAP,
  getCollectionMeta,
};
