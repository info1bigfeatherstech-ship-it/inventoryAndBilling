const { AppError } = require('../errors/AppError');

const WH_WRITE_ROLES = new Set(['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER']);
const WH_READ_ROLES = new Set(['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER']);

/**
 * Assert user may read/write debit notes for a warehouse.
 */
const assertWarehouseDebitNoteAccess = (warehouseId, user, { write = false } = {}) => {
  const allowed = write ? WH_WRITE_ROLES : WH_READ_ROLES;
  if (!allowed.has(user.role)) {
    throw new AppError('Not authorized for warehouse debit notes', 403, 'FORBIDDEN');
  }

  if (user.role === 'SUPER_ADMIN') return;

  if (!user.warehouseId) {
    throw new AppError('User is not assigned to a warehouse', 403, 'WAREHOUSE_NOT_ASSIGNED');
  }

  if (warehouseId && warehouseId !== user.warehouseId) {
    throw new AppError('Cannot access debit notes for another warehouse', 403, 'WAREHOUSE_FORBIDDEN');
  }
};

/**
 * Apply warehouse scope to list filters.
 */
const applyDebitNoteListScope = (where, user) => {
  if (user.role !== 'SUPER_ADMIN' && user.warehouseId) {
    where.warehouse_id = user.warehouseId;
  }
  return where;
};

module.exports = {
  WH_WRITE_ROLES,
  assertWarehouseDebitNoteAccess,
  applyDebitNoteListScope,
};
