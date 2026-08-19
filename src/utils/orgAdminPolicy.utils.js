const prisma = require('./prisma.utils');
const { AppError } = require('../middlewares/error.middleware');
const { UserRole } = require('../constants/userRole.constants');
const {
  isSuperAdmin,
  isOrgManager,
  isPrivilegedUser,
  normalizeRoleTitle,
} = require('./orgRole.utils');

const FRANCHISE = 'FRANCHISE';

const assertActorPresent = (actor) => {
  if (!actor || !actor.role) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }
};

const loadShopType = async (shopId) => {
  if (!shopId) return null;
  try {
    const shop = await prisma.shop.findUnique({
      where: { shop_id: shopId },
      select: { shop_id: true, shop_type: true },
    });
    return shop?.shop_type || null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Unable to verify shop type', 500, 'SHOP_TYPE_LOOKUP_FAILED');
  }
};

const isFranchiseShopType = (shopType) => shopType === FRANCHISE;

const assertCanCreateShop = (actor, shopType) => {
  assertActorPresent(actor);
  if (isSuperAdmin(actor)) return;
  if (!isOrgManager(actor)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
  if (isFranchiseShopType(shopType)) {
    throw new AppError(
      'Only Super Admin can create franchise shops',
      403,
      'FRANCHISE_SHOP_FORBIDDEN'
    );
  }
};

const assertCanMutateShop = (actor, shop, nextType) => {
  assertActorPresent(actor);
  if (isSuperAdmin(actor)) return;
  if (!isOrgManager(actor)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
  if (isFranchiseShopType(shop?.shop_type)) {
    throw new AppError(
      'Only Super Admin can change franchise shops',
      403,
      'FRANCHISE_SHOP_FORBIDDEN'
    );
  }
  if (isFranchiseShopType(nextType)) {
    throw new AppError(
      'Only Super Admin can change a shop to Franchise',
      403,
      'FRANCHISE_SHOP_FORBIDDEN'
    );
  }
};

const assertNotFranchiseOwnerTarget = async ({ role, shopId, existing = null }) => {
  const effectiveRole = role || existing?.role;
  if (effectiveRole !== UserRole.SHOP_OWNER) return;

  const shopIds = new Set();
  if (shopId) shopIds.add(shopId);
  if (existing?.shop_id) shopIds.add(existing.shop_id);

  if (existing?.user_id) {
    try {
      const owned = await prisma.shop.findFirst({
        where: { owner_user_id: existing.user_id },
        select: { shop_id: true, shop_type: true },
      });
      if (isFranchiseShopType(owned?.shop_type)) {
        throw new AppError(
          'Only Super Admin can manage franchise shop owners',
          403,
          'FRANCHISE_OWNER_FORBIDDEN'
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('Unable to verify franchise owner access', 500, 'FRANCHISE_OWNER_LOOKUP_FAILED');
    }
  }

  for (const id of shopIds) {
    const shopType = await loadShopType(id);
    if (isFranchiseShopType(shopType)) {
      throw new AppError(
        'Only Super Admin can manage franchise shop owners',
        403,
        'FRANCHISE_OWNER_FORBIDDEN'
      );
    }
  }
};

/**
 * Admin user APIs (list is allowed). Writes:
 * - SUPER_ADMIN: full
 * - ORG_MANAGER: cannot create/update/deactivate SUPER_ADMIN or ORG_MANAGER
 * - ORG_MANAGER: cannot create/update/deactivate franchise SHOP_OWNER
 */
const assertCanMutateAdminUser = async (actor, { existing = null, nextRole, nextShopId } = {}) => {
  assertActorPresent(actor);
  if (isSuperAdmin(actor)) return;

  if (!isOrgManager(actor)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const targetRole = existing?.role;
  const roleAfter = nextRole !== undefined ? nextRole : targetRole;

  if (isPrivilegedUser(targetRole) || isPrivilegedUser(roleAfter)) {
    throw new AppError(
      'Only Super Admin can manage Super Admin and Org Manager accounts',
      403,
      'PRIVILEGED_USER_FORBIDDEN'
    );
  }

  const shopAfter = nextShopId !== undefined ? nextShopId : existing?.shop_id;
  await assertNotFranchiseOwnerTarget({
    role: roleAfter,
    shopId: shopAfter,
    existing,
  });
};

const resolveCreateRoleTitle = (actor, role, roleTitle) => {
  if (role !== UserRole.ORG_MANAGER) {
    return null;
  }
  if (!isSuperAdmin(actor)) {
    throw new AppError(
      'Only Super Admin can create Org Manager accounts',
      403,
      'PRIVILEGED_USER_FORBIDDEN'
    );
  }
  return normalizeRoleTitle(roleTitle, { required: true });
};

const resolveUpdateRoleTitle = (actor, { existingRole, nextRole, nextTitle, hasTitle }) => {
  const roleAfter = nextRole !== undefined ? nextRole : existingRole;
  if (roleAfter !== UserRole.ORG_MANAGER) {
    return hasTitle || (nextRole !== undefined && existingRole === UserRole.ORG_MANAGER)
      ? null
      : undefined;
  }
  if (!hasTitle) return undefined;
  if (!isSuperAdmin(actor)) {
    throw new AppError(
      'Only Super Admin can change an Org Manager role title',
      403,
      'PRIVILEGED_USER_FORBIDDEN'
    );
  }
  return normalizeRoleTitle(nextTitle, { required: true });
};

module.exports = {
  FRANCHISE,
  assertCanCreateShop,
  assertCanMutateShop,
  assertCanMutateAdminUser,
  resolveCreateRoleTitle,
  resolveUpdateRoleTitle,
  loadShopType,
};
