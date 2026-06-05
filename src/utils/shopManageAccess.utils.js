const { AppError } = require('../middlewares/error.middleware');
const { assertShopReadAccess, resolveShopIdForUser } = require('./shopAccess.utils');
const { resolveOwnerShopId } = require('./transferRequest.utils');

const BANK_READ_ROLES = new Set(['SUPER_ADMIN', 'SHOP_OWNER', 'BILLING_STAFF']);
const BANK_WRITE_ROLES = new Set(['SUPER_ADMIN', 'SHOP_OWNER']);

const resolveManagedShopId = async (user, requestedShopId) => {
  if (user?.role === 'SHOP_OWNER') {
    const ownedShopId = await resolveOwnerShopId(user);
    const shopId = ownedShopId || user.shopId;
    if (!shopId) throw new AppError('User is not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
    if (requestedShopId && requestedShopId !== shopId) {
      throw new AppError('Cannot access another shop', 403, 'SHOP_FORBIDDEN');
    }
    return shopId;
  }
  return resolveShopIdForUser(user, requestedShopId);
};

const assertShopBankReadAccess = async (shopId, user) => {
  if (!BANK_READ_ROLES.has(user?.role)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const resolvedShopId = await resolveManagedShopId(user, shopId);
  assertShopReadAccess(resolvedShopId, user);
  return resolvedShopId;
};

const assertShopBankWriteAccess = async (shopId, user) => {
  if (!BANK_WRITE_ROLES.has(user?.role)) {
    throw new AppError('Only shop owners can manage bank accounts', 403, 'FORBIDDEN');
  }
  const resolvedShopId = await resolveManagedShopId(user, shopId);
  assertShopReadAccess(resolvedShopId, user);
  return resolvedShopId;
};

module.exports = {
  BANK_READ_ROLES,
  BANK_WRITE_ROLES,
  resolveManagedShopId,
  assertShopBankReadAccess,
  assertShopBankWriteAccess,
};
