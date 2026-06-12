/** @typedef {'customer' | 'bill' | 'bill_payment' | 'credit_note' | 'stock_adjustment' | 'shop_expense' | 'transfer_receive'} SyncEntityType */

const SYNC_API_VERSION = 1;

const OFFLINE_SYNC_ROLES = Object.freeze([
  'SUPER_ADMIN',
  'SHOP_OWNER',
  'BILLING_STAFF',
  'SHOP_STOCK_LISTER',
]);

const SYNC_ENTITY_TYPES = Object.freeze([
  'customer',
  'bill',
  'bill_payment',
  'credit_note',
  'stock_adjustment',
  'shop_expense',
  'transfer_receive',
]);

const SYNC_PULL_SECTIONS = Object.freeze(['config', 'stocks', 'customers']);

const SYNC_DEFAULT_PAGE_LIMIT = 500;
const SYNC_MAX_PAGE_LIMIT = 1000;

const SYNC_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const SYNC_PUSH_RESULT_STATUS = Object.freeze({
  APPLIED: 'applied',
  DUPLICATE: 'duplicate',
  CONFLICT: 'conflict',
  ERROR: 'error',
  DEFERRED: 'deferred',
});

module.exports = {
  SYNC_API_VERSION,
  OFFLINE_SYNC_ROLES,
  SYNC_ENTITY_TYPES,
  SYNC_PULL_SECTIONS,
  SYNC_DEFAULT_PAGE_LIMIT,
  SYNC_MAX_PAGE_LIMIT,
  SYNC_IDEMPOTENCY_TTL_SECONDS,
  SYNC_PUSH_RESULT_STATUS,
};
