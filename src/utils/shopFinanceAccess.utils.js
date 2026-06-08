const { AppError } = require('../errors/AppError');

const SHOP_FINANCE_READ_ROLES = new Set(['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_STOCK_LISTER']);
const SHOP_FINANCE_WRITE_ROLES = new Set(['SUPER_ADMIN', 'SHOP_OWNER']);
const SHOP_FINANCE_CANCEL_ROLES = new Set(['SUPER_ADMIN', 'SHOP_OWNER']);

const assertShopFinanceAccess = (shopId, user, { write = false, cancel = false } = {}) => {
  const allowed = cancel ? SHOP_FINANCE_CANCEL_ROLES : write ? SHOP_FINANCE_WRITE_ROLES : SHOP_FINANCE_READ_ROLES;
  if (!allowed.has(user.role)) {
    throw new AppError('Not authorized for shop finance operations', 403, 'FORBIDDEN');
  }
  if (user.role === 'SUPER_ADMIN') return;
  if (!user.shopId) {
    throw new AppError('User is not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
  }
  if (shopId && shopId !== user.shopId) {
    throw new AppError('Cannot access another shop', 403, 'SHOP_FORBIDDEN');
  }
};

const applyShopFinanceScope = (where, user) => {
  if (user.role !== 'SUPER_ADMIN' && user.shopId) {
    where.shop_id = user.shopId;
  }
  return where;
};

const resolveShopIdForFinance = (user, requestedShopId) => {
  if (user.role === 'SUPER_ADMIN') {
    if (!requestedShopId) {
      throw new AppError('shop_id is required', 400, 'SHOP_ID_REQUIRED');
    }
    return requestedShopId;
  }
  if (!user.shopId) {
    throw new AppError('User is not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
  }
  if (requestedShopId && requestedShopId !== user.shopId) {
    throw new AppError('Cannot access another shop', 403, 'SHOP_FORBIDDEN');
  }
  return user.shopId;
};

module.exports = {
  SHOP_FINANCE_READ_ROLES,
  SHOP_FINANCE_WRITE_ROLES,
  assertShopFinanceAccess,
  applyShopFinanceScope,
  resolveShopIdForFinance,
};
