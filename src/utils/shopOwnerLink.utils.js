const prisma = require('./prisma.utils');
const { AppError } = require('../middlewares/error.middleware');
const logger = require('./logger.utils');

/**
 * Keep users.shop_id and shops.owner_user_id aligned for SHOP_OWNER.
 * Safe to call when only one side was set (e.g. user created with shop_id first).
 */
const syncShopOwnerAssignment = async ({ userId, shopId, tx = prisma }) => {
  if (!userId) return;

  const user = await tx.user.findUnique({
    where: { user_id: userId },
    select: { user_id: true, role: true, shop_id: true },
  });

  if (!user || user.role !== 'SHOP_OWNER') {
    return;
  }

  if (!shopId) {
    await tx.shop.updateMany({
      where: { owner_user_id: userId },
      data: { owner_user_id: null },
    });
    return;
  }

  const targetShop = await tx.shop.findUnique({
    where: { shop_id: shopId },
    select: { shop_id: true, owner_user_id: true },
  });

  if (!targetShop) {
    throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  }

  if (targetShop.owner_user_id && targetShop.owner_user_id !== userId) {
    throw new AppError(
      'This shop is already assigned to another owner',
      409,
      'SHOP_OWNER_ALREADY_ASSIGNED'
    );
  }

  const previouslyOwnedShop = await tx.shop.findFirst({
    where: {
      owner_user_id: userId,
      shop_id: { not: shopId },
    },
    select: { shop_id: true },
  });

  if (previouslyOwnedShop) {
    await tx.shop.update({
      where: { shop_id: previouslyOwnedShop.shop_id },
      data: { owner_user_id: null },
    });
  }

  if (user.shop_id !== shopId) {
    await tx.user.update({
      where: { user_id: userId },
      data: { shop_id: shopId },
    });
  }

  if (targetShop.owner_user_id !== userId) {
    await tx.shop.update({
      where: { shop_id: shopId },
      data: { owner_user_id: userId },
    });
    logger.info('Shop owner link synced', { user_id: userId, shop_id: shopId });
  }
};

/**
 * Clear owner link when shop owner_user_id is removed via shop admin update.
 */
const clearShopOwnerAssignment = async ({ shopId, previousOwnerUserId, tx = prisma }) => {
  if (!shopId) return;

  await tx.shop.update({
    where: { shop_id: shopId },
    data: { owner_user_id: null },
  });

  if (previousOwnerUserId) {
    await tx.user.updateMany({
      where: {
        user_id: previousOwnerUserId,
        shop_id: shopId,
        role: 'SHOP_OWNER',
      },
      data: { shop_id: null },
    });
  }
};

/**
 * Resolve a SHOP_OWNER's shop by owner_user_id, with optional repair from users.shop_id.
 */
const resolveShopForOwner = async (
  ownerUserId,
  { userShopId = null, repair = false, shopSelect, tx = prisma }
) => {
  const effectiveSelect = {
    owner_user_id: true,
    ...(shopSelect || {}),
  };

  let shop = await tx.shop.findUnique({
    where: { owner_user_id: ownerUserId },
    select: effectiveSelect,
  });

  if (shop) {
    return shop;
  }

  if (!userShopId) {
    return null;
  }

  shop = await tx.shop.findUnique({
    where: { shop_id: userShopId },
    select: effectiveSelect,
  });

  if (!shop) {
    return null;
  }

  if (shop.owner_user_id && shop.owner_user_id !== ownerUserId) {
    throw new AppError(
      'Your account shop does not match the registered shop owner',
      409,
      'SHOP_OWNER_MISMATCH'
    );
  }

  if (repair && !shop.owner_user_id) {
    await syncShopOwnerAssignment({ userId: ownerUserId, shopId: userShopId, tx });
    shop = await tx.shop.findUnique({
      where: { shop_id: userShopId },
      select: effectiveSelect,
    });
  }

  return shop;
};

module.exports = {
  syncShopOwnerAssignment,
  clearShopOwnerAssignment,
  resolveShopForOwner,
};
