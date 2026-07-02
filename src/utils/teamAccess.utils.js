const prisma = require('./prisma.utils');
const { AppError } = require('../middlewares/error.middleware');

const {
  SHOP_TEAM_ROLES,
  SHOP_OWNER_CREATABLE_TEAM_ROLES,
  SHOP_OWNER_EDITABLE_TEAM_ROLES,
} = require('../constants/userRole.constants');

const SHOP_OWNER_CREATABLE_ROLES = [...SHOP_OWNER_CREATABLE_TEAM_ROLES];
const SHOP_OWNER_EDITABLE_ROLES = [...SHOP_OWNER_EDITABLE_TEAM_ROLES];
const WAREHOUSE_TEAM_ROLES = ['WH_MANAGER', 'WH_STOCK_LISTER'];
const WH_MANAGER_CREATABLE_ROLES = ['WH_STOCK_LISTER'];
const WH_MANAGER_EDITABLE_ROLES = ['WH_STOCK_LISTER'];

/**
 * Resolve shop scope for SHOP_OWNER (User.shop_id or Shop.owner_user_id).
 */
const resolveShopScopeId = async (user) => {
  if (user.role !== 'SHOP_OWNER') return null;
  if (user.shopId) return user.shopId;

  const owned = await prisma.shop.findFirst({
    where: { owner_user_id: user.userId },
    select: { shop_id: true },
  });
  return owned?.shop_id ?? null;
};

/**
 * Resolve warehouse scope for WH_MANAGER.
 */
const resolveWarehouseScopeId = (user) => {
  if (user.role !== 'WH_MANAGER') return null;
  return user.warehouseId || null;
};

const assertShopScope = async (user) => {
  const shopId = await resolveShopScopeId(user);
  if (!shopId) {
    throw new AppError('No shop is assigned to this shop owner account', 403, 'SHOP_SCOPE_REQUIRED');
  }
  return shopId;
};

const assertWarehouseScope = (user) => {
  const warehouseId = resolveWarehouseScopeId(user);
  if (!warehouseId) {
    throw new AppError('No warehouse is assigned to this manager account', 403, 'WAREHOUSE_SCOPE_REQUIRED');
  }
  return warehouseId;
};

const getCreatableRoles = (actorRole) => {
  if (actorRole === 'SHOP_OWNER') return SHOP_OWNER_CREATABLE_ROLES;
  if (actorRole === 'WH_MANAGER') return WH_MANAGER_CREATABLE_ROLES;
  return [];
};

const getEditableRoles = (actorRole) => {
  if (actorRole === 'SHOP_OWNER') return SHOP_OWNER_EDITABLE_ROLES;
  if (actorRole === 'WH_MANAGER') return WH_MANAGER_EDITABLE_ROLES;
  return [];
};

const canManageTeam = (actorRole) => ['SHOP_OWNER', 'WH_MANAGER'].includes(actorRole);

const assertCreatableRole = (actorRole, targetRole) => {
  const allowed = getCreatableRoles(actorRole);
  if (!allowed.includes(targetRole)) {
    throw new AppError(
      `You cannot create users with role ${targetRole}`,
      403,
      'TEAM_ROLE_CREATE_FORBIDDEN'
    );
  }
};

const assertEditableTarget = (actor, targetUser) => {
  if (targetUser.user_id === actor.userId) {
    throw new AppError('You cannot edit your own account from Team Members', 403, 'TEAM_SELF_EDIT_FORBIDDEN');
  }

  const allowed = getEditableRoles(actor.role);
  if (!allowed.includes(targetUser.role)) {
    throw new AppError(
      `You cannot edit team members with role ${targetUser.role}`,
      403,
      'TEAM_ROLE_EDIT_FORBIDDEN'
    );
  }
};

const buildShopTeamWhere = async (shopId) => {
  const shop = await prisma.shop.findUnique({
    where: { shop_id: shopId },
    select: { owner_user_id: true },
  });
  if (!shop) {
    throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  }

  const or = [{ shop_id: shopId }];
  if (shop.owner_user_id) {
    or.push({ user_id: shop.owner_user_id });
  }

  return {
    OR: or,
    role: { in: SHOP_TEAM_ROLES },
  };
};

const buildWarehouseTeamWhere = (warehouseId) => ({
  warehouse_id: warehouseId,
  role: { in: WAREHOUSE_TEAM_ROLES },
});

const assertUserInShopTeam = async (shopId, userId) => {
  const where = await buildShopTeamWhere(shopId);
  const member = await prisma.user.findFirst({
    where: { ...where, user_id: userId },
    select: { user_id: true },
  });
  if (!member) {
    throw new AppError('Team member not found in your shop', 404, 'TEAM_MEMBER_NOT_FOUND');
  }
};

const assertUserInWarehouseTeam = async (warehouseId, userId) => {
  const member = await prisma.user.findFirst({
    where: { ...buildWarehouseTeamWhere(warehouseId), user_id: userId },
    select: { user_id: true },
  });
  if (!member) {
    throw new AppError('Team member not found in your warehouse', 404, 'TEAM_MEMBER_NOT_FOUND');
  }
};

module.exports = {
  SHOP_TEAM_ROLES,
  WAREHOUSE_TEAM_ROLES,
  SHOP_OWNER_CREATABLE_ROLES,
  WH_MANAGER_CREATABLE_ROLES,
  SHOP_OWNER_EDITABLE_ROLES,
  WH_MANAGER_EDITABLE_ROLES,
  resolveShopScopeId,
  resolveWarehouseScopeId,
  assertShopScope,
  assertWarehouseScope,
  getCreatableRoles,
  getEditableRoles,
  canManageTeam,
  assertCreatableRole,
  assertEditableTarget,
  buildShopTeamWhere,
  buildWarehouseTeamWhere,
  assertUserInShopTeam,
  assertUserInWarehouseTeam,
};
