const { AppError } = require('../errors/AppError');

const WH_READ_ROLES = new Set(['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER']);
const WH_WRITE_ROLES = new Set(['SUPER_ADMIN', 'WH_MANAGER']);
const WH_CANCEL_ROLES = new Set(['SUPER_ADMIN', 'WH_MANAGER']);

const assertWarehouseFinanceAccess = (warehouseId, user, { write = false, cancel = false } = {}) => {
  const allowed = cancel ? WH_CANCEL_ROLES : write ? WH_WRITE_ROLES : WH_READ_ROLES;
  if (!allowed.has(user.role)) {
    throw new AppError('Not authorized for warehouse finance operations', 403, 'FORBIDDEN');
  }
  if (user.role === 'SUPER_ADMIN') return;
  if (!user.warehouseId) {
    throw new AppError('User is not assigned to a warehouse', 403, 'WAREHOUSE_NOT_ASSIGNED');
  }
  if (warehouseId && warehouseId !== user.warehouseId) {
    throw new AppError('Cannot access another warehouse', 403, 'WAREHOUSE_FORBIDDEN');
  }
};

const applyWarehouseFinanceScope = (where, user) => {
  if (user.role !== 'SUPER_ADMIN' && user.warehouseId) {
    where.warehouse_id = user.warehouseId;
  }
  return where;
};

const resolveWarehouseIdForUser = (user, requestedWarehouseId) => {
  if (user.role === 'SUPER_ADMIN') {
    if (!requestedWarehouseId) {
      throw new AppError('warehouse_id is required', 400, 'WAREHOUSE_ID_REQUIRED');
    }
    return requestedWarehouseId;
  }
  if (!user.warehouseId) {
    throw new AppError('User is not assigned to a warehouse', 403, 'WAREHOUSE_NOT_ASSIGNED');
  }
  if (requestedWarehouseId && requestedWarehouseId !== user.warehouseId) {
    throw new AppError('Cannot access another warehouse', 403, 'WAREHOUSE_FORBIDDEN');
  }
  return user.warehouseId;
};

module.exports = {
  WH_READ_ROLES,
  WH_WRITE_ROLES,
  assertWarehouseFinanceAccess,
  applyWarehouseFinanceScope,
  resolveWarehouseIdForUser,
};
