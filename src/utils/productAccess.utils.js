const { AppError } = require('../middlewares/error.middleware');

const WAREHOUSE_ROLES = new Set(['WH_MANAGER', 'WH_STOCK_LISTER']);
const CATALOG_READ_ROLES = new Set(['SHOP_OWNER', 'SHOP_MANAGER', 'BILLING_STAFF']);

const resolveWarehouseId = (user, requestedWarehouseId) => {
  if (user.role === 'SUPER_ADMIN') {
    const warehouseId = requestedWarehouseId || user.warehouseId;
    if (!warehouseId) {
      throw new AppError('warehouse_id is required for super admin product operations', 400, 'WAREHOUSE_ID_REQUIRED');
    }
    return warehouseId;
  }

  if (!user.warehouseId) {
    throw new AppError('User is not assigned to a warehouse', 403, 'WAREHOUSE_NOT_ASSIGNED');
  }

  if (requestedWarehouseId && requestedWarehouseId !== user.warehouseId) {
    throw new AppError('Cannot access another warehouse', 403, 'WAREHOUSE_FORBIDDEN');
  }

  return user.warehouseId;
};

const applyWarehouseScope = (where, user, warehouseIdField = 'warehouse_id') => {
  if (CATALOG_READ_ROLES.has(user.role)) {
    return where;
  }

  if (user.role === 'SUPER_ADMIN') {
    if (user.requestedWarehouseFilter) {
      where[warehouseIdField] = user.requestedWarehouseFilter;
    }
    return where;
  }

  if (!user.warehouseId) {
    throw new AppError('User is not assigned to a warehouse', 403, 'WAREHOUSE_NOT_ASSIGNED');
  }

  where[warehouseIdField] = user.warehouseId;
  return where;
};

const assertProductWarehouseAccess = (productWarehouseId, user) => {
  if (user.role === 'SUPER_ADMIN' || CATALOG_READ_ROLES.has(user.role)) return;

  if (!user.warehouseId || productWarehouseId !== user.warehouseId) {
    throw new AppError('Product not found in your warehouse', 404, 'PRODUCT_NOT_FOUND');
  }
};

const requireWarehouseRole = (user) => {
  if (user.role === 'SUPER_ADMIN' || WAREHOUSE_ROLES.has(user.role)) return;
  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
};

module.exports = {
  WAREHOUSE_ROLES,
  CATALOG_READ_ROLES,
  resolveWarehouseId,
  applyWarehouseScope,
  assertProductWarehouseAccess,
  requireWarehouseRole,
};
