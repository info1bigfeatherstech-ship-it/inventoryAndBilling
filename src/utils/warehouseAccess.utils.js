const { AppError } = require('../middlewares/error.middleware');

const WAREHOUSE_STAFF_ROLES = new Set(['WH_MANAGER', 'WH_STOCK_LISTER']);
const SHOP_TRANSFER_ROLES = new Set(['SHOP_OWNER', 'SHOP_STOCK_LISTER']);

const isSuperAdmin = (user) => user?.role === 'SUPER_ADMIN';

const isWarehouseStaff = (user) => WAREHOUSE_STAFF_ROLES.has(user?.role);

const isShopTransferRole = (user) => SHOP_TRANSFER_ROLES.has(user?.role);

const assertWarehouseAssigned = (user) => {
  if (isSuperAdmin(user)) return;
  if (!isWarehouseStaff(user)) return;

  if (!user.warehouseId) {
    throw new AppError(
      'Your account is not assigned to a warehouse. Contact super admin.',
      403,
      'WAREHOUSE_NOT_ASSIGNED'
    );
  }
};

const assertCanReadWarehouse = (user, warehouseId) => {
  if (isSuperAdmin(user)) return;
  if (isShopTransferRole(user)) return;
  assertWarehouseAssigned(user);

  if (user.warehouseId !== warehouseId) {
    throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  }
};

/** List all active warehouses (e.g. shop owner / WH peer source picker). */
const applyWarehouseListScope = (where, user) => {
  if (isSuperAdmin(user)) return where;
  if (isShopTransferRole(user)) return where;
  if (isWarehouseStaff(user)) return where;
  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
};

module.exports = {
  WAREHOUSE_STAFF_ROLES,
  SHOP_TRANSFER_ROLES,
  isSuperAdmin,
  isWarehouseStaff,
  isShopTransferRole,
  assertWarehouseAssigned,
  assertCanReadWarehouse,
  applyWarehouseListScope,
};
