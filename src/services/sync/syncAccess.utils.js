const { AppError } = require('../../errors/AppError');
const { resolveShopIdForUser } = require('../../utils/shopAccess.utils');
const { resolveOwnerShopId } = require('../../utils/transferRequest.utils');
const { OFFLINE_SYNC_ROLES } = require('./sync.constants');

const assertOfflineSyncRole = (user) => {
  if (!user?.role || !OFFLINE_SYNC_ROLES.includes(user.role)) {
    throw new AppError('Offline sync is only available for shop staff', 403, 'OFFLINE_SYNC_FORBIDDEN');
  }
};

/**
 * Resolve shop context for offline sync — mirrors billing shop resolution for SHOP_OWNER.
 */
const resolveSyncShopId = async (user, requestedShopId) => {
  assertOfflineSyncRole(user);

  if (user.role === 'SUPER_ADMIN') {
    if (!requestedShopId) {
      throw new AppError('shop_id is required', 400, 'SHOP_ID_REQUIRED');
    }
    return requestedShopId;
  }

  if (user.role === 'SHOP_OWNER') {
    const ownedShopId = await resolveOwnerShopId(user);
    const shopId = ownedShopId || user.shopId;
    if (!shopId) {
      throw new AppError('User is not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
    }
    if (requestedShopId && requestedShopId !== shopId) {
      throw new AppError('Cannot sync another shop', 403, 'SHOP_FORBIDDEN');
    }
    return shopId;
  }

  return resolveShopIdForUser(user, requestedShopId);
};

module.exports = {
  assertOfflineSyncRole,
  resolveSyncShopId,
};
