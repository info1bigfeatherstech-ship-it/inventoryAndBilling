const { AppError } = require('../errors/AppError');
const { toRoleSet, SHOP_STAFF_ROLES } = require('../constants/userRole.constants');

const SHOP_STAFF_ROLE_SET = toRoleSet(SHOP_STAFF_ROLES);

const assertShopReadAccess = (shopId, user) => {
  if (!shopId) return;
  if (user?.role === 'SUPER_ADMIN') return;

  if (SHOP_STAFF_ROLE_SET.has(user?.role)) {
    if (user.shopId && user.shopId === shopId) return;
    throw new AppError('You can only access your assigned shop', 403, 'SHOP_FORBIDDEN');
  }

  if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user?.role)) {
    return;
  }
};

const resolveShopIdForUser = (user, requestedShopId) => {
  if (user?.role === 'SUPER_ADMIN') {
    if (!requestedShopId) {
      throw new AppError('shop_id is required', 400, 'SHOP_ID_REQUIRED');
    }
    return requestedShopId;
  }

  if (SHOP_STAFF_ROLE_SET.has(user?.role)) {
    if (!user.shopId) {
      throw new AppError('User is not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
    }
    if (requestedShopId && requestedShopId !== user.shopId) {
      throw new AppError('Cannot access another shop', 403, 'SHOP_FORBIDDEN');
    }
    return user.shopId;
  }

  if (requestedShopId) return requestedShopId;
  throw new AppError('shop_id is required', 400, 'SHOP_ID_REQUIRED');
};

const applyShopListScope = (where, user) => {
  if (user?.role === 'SUPER_ADMIN') return where;

  if (SHOP_STAFF_ROLE_SET.has(user?.role) && user.shopId) {
    where.shop_id = user.shopId;
  }

  return where;
};

module.exports = {
  SHOP_STAFF_ROLES: SHOP_STAFF_ROLE_SET,
  assertShopReadAccess,
  resolveShopIdForUser,
  applyShopListScope,
};
