const { AppError } = require('../errors/AppError');
const { resolveShopIdForUser } = require('./shopAccess.utils');
const { resolveOwnerShopId } = require('./transferRequest.utils');

const SHOP_BILLING_ROLES = new Set(['SHOP_OWNER', 'BILLING_STAFF', 'SHOP_STOCK_LISTER']);
const SHOP_WRITE_ROLES = new Set(['SHOP_OWNER', 'BILLING_STAFF']);

/**
 * Resolve shop id for billing write operations.
 */
const resolveBillingShopId = async (user, requestedShopId) => {
  if (user.role === 'SUPER_ADMIN') {
    if (!requestedShopId) {
      throw new AppError('shop_id is required', 400, 'SHOP_ID_REQUIRED');
    }
    return requestedShopId;
  }

  if (user.role === 'SHOP_OWNER') {
    const ownedShopId = await resolveOwnerShopId(user);
    const shopId = ownedShopId || user.shopId;
    if (!shopId) throw new AppError('User is not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
    if (requestedShopId && requestedShopId !== shopId) {
      throw new AppError('Cannot create bills for another shop', 403, 'SHOP_FORBIDDEN');
    }
    return shopId;
  }

  if (SHOP_BILLING_ROLES.has(user.role)) {
    if (!user.shopId) throw new AppError('User is not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
    if (requestedShopId && requestedShopId !== user.shopId) {
      throw new AppError('Cannot access another shop', 403, 'SHOP_FORBIDDEN');
    }
    return user.shopId;
  }

  throw new AppError('Insufficient permissions for billing', 403, 'FORBIDDEN');
};

/**
 * Assert user may read a bill for the given shop.
 */
const assertBillReadAccess = async (shopId, user) => {
  if (user.role === 'SUPER_ADMIN') return;
  if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) return;

  if (user.role === 'SHOP_OWNER') {
    const owned = await resolveOwnerShopId(user);
    const allowed = owned || user.shopId;
    if (allowed === shopId) return;
    throw new AppError('You can only access bills for your shop', 403, 'SHOP_FORBIDDEN');
  }

  if (SHOP_BILLING_ROLES.has(user.role)) {
    if (user.shopId === shopId) return;
    throw new AppError('You can only access bills for your assigned shop', 403, 'SHOP_FORBIDDEN');
  }

  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
};

/**
 * Assert user may mutate bills (create, pay, cancel).
 */
const assertBillWriteAccess = async (shopId, user) => {
  if (user.role === 'SUPER_ADMIN') return;

  if (user.role === 'SHOP_OWNER') {
    const owned = await resolveOwnerShopId(user);
    if ((owned || user.shopId) === shopId) return;
    throw new AppError('You can only manage bills for your shop', 403, 'SHOP_FORBIDDEN');
  }

  if (SHOP_WRITE_ROLES.has(user.role) && user.shopId === shopId) return;

  throw new AppError('Insufficient permissions to modify bills', 403, 'FORBIDDEN');
};

/**
 * Build Prisma where for bill list queries.
 */
const applyBillListScope = async (where, user) => {
  if (user.role === 'SUPER_ADMIN') return where;

  if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
    return where;
  }

  if (user.role === 'SHOP_OWNER') {
    const shopId = await resolveOwnerShopId(user);
    if (shopId) where.shop_id = shopId;
    else if (user.shopId) where.shop_id = user.shopId;
    return where;
  }

  if (SHOP_BILLING_ROLES.has(user.role) && user.shopId) {
    where.shop_id = user.shopId;
  }

  return where;
};

module.exports = {
  SHOP_BILLING_ROLES,
  SHOP_WRITE_ROLES,
  resolveBillingShopId,
  assertBillReadAccess,
  assertBillWriteAccess,
  applyBillListScope,
};
