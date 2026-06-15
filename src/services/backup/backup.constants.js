// backup.constants.js — shared constants for backup module

const BACKUP_FORMAT_VERSION = '1.1.0';
const BACKUP_APP_NAME = 'BizCentro';

const GOOGLE_DRIVE_ROOT_FOLDER = 'BizCentro_Backups';

const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

const BACKUP_ACCESS_ROLES = [
  'SUPER_ADMIN',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
  'SHOP_OWNER',
];

const RESTORE_REPLACE_ROLES = ['SUPER_ADMIN'];

const BACKUP_TYPE = {
  AUTO: 'AUTO',
  MANUAL_COMPUTER: 'MANUAL_COMPUTER',
  MANUAL_DRIVE: 'MANUAL_DRIVE',
};

const BACKUP_STATUS = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
};

const RESTORE_MODE = {
  MERGE: 'MERGE',
  REPLACE: 'REPLACE',
  MISSING_ONLY: 'MISSING_ONLY',
};

const STORAGE_LOCATION = {
  LOCAL: 'LOCAL',
  GOOGLE_DRIVE: 'GOOGLE_DRIVE',
};

const SCOPE_TYPE = {
  SYSTEM: 'SYSTEM',
  SHOP: 'SHOP',
  WAREHOUSE: 'WAREHOUSE',
};

/** Restore order respects foreign-key dependencies (parents before children). */
const RESTORE_COLLECTION_ORDER = [
  'categories',
  'vendors',
  'warehouses',
  'shops',
  'products',
  'product_variants',
  'product_variant_images',
  'shop_gst_registrations',
  'shop_bank_accounts',
  'shop_staff_codes',
  'customers',
  'product_stocks',
  'shop_stocks',
  'shop_product_levels',
  'purchase_entries',
  'purchase_items',
  'warehouse_expenses',
  'shop_expenses',
  'vendor_payments',
  'vendor_payment_allocations',
  'inward_receipts',
  'inward_receipt_items',
  'debit_notes',
  'debit_note_line_items',
  'bills',
  'bill_line_items',
  'bill_payments',
  'credit_notes',
  'credit_note_line_items',
  'credit_note_redemptions',
  'transfer_requests',
  'bulk_transfer_requests',
  'bulk_transfer_request_items',
  'stock_ledgers',
  'users',
];

/** Reverse order for REPLACE-mode scoped deletes. */
const RESTORE_DELETE_ORDER = [...RESTORE_COLLECTION_ORDER].reverse();

const MAX_BACKUP_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

const DEFAULT_CLIENT_SETTINGS = {
  auto_backup_enabled: false,
  auto_backup_frequency: 'DAILY',
  auto_backup_time: '02:00',
  retention_days: 30,
  auto_delete_old_backups: true,
  email_on_success: false,
  email_on_failure: true,
  email_on_late: false,
  include_bills: true,
  include_customers: true,
  include_products: true,
  include_stock: true,
  include_staff_codes: true,
  include_settings: true,
  compression_level: 'NORMAL',
  encrypt_backup: false,
};

module.exports = {
  BACKUP_FORMAT_VERSION,
  BACKUP_APP_NAME,
  GOOGLE_DRIVE_ROOT_FOLDER,
  GOOGLE_DRIVE_SCOPES,
  BACKUP_ACCESS_ROLES,
  RESTORE_REPLACE_ROLES,
  BACKUP_TYPE,
  BACKUP_STATUS,
  RESTORE_MODE,
  STORAGE_LOCATION,
  SCOPE_TYPE,
  RESTORE_COLLECTION_ORDER,
  RESTORE_DELETE_ORDER,
  MAX_BACKUP_UPLOAD_BYTES,
  DEFAULT_CLIENT_SETTINGS,
};
