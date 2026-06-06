const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const UserService = require('./user.service');
const {
  assertShopScope,
  assertWarehouseScope,
  assertCreatableRole,
  assertEditableTarget,
  buildShopTeamWhere,
  buildWarehouseTeamWhere,
  assertUserInShopTeam,
  assertUserInWarehouseTeam,
  getCreatableRoles,
  SHOP_OWNER_CREATABLE_ROLES,
  WH_MANAGER_CREATABLE_ROLES,
} = require('../../utils/teamAccess.utils');

const USER_SELECT = {
  user_id: true,
  name: true,
  phone: true,
  role: true,
  warehouse_id: true,
  shop_id: true,
  is_active: true,
  remarks: true,
  created_at: true,
  updated_at: true,
};

const buildTeamSearchWhere = (baseWhere, query = {}) => {
  const clauses = [baseWhere];

  if (typeof query.is_active === 'boolean') {
    clauses.push({ is_active: query.is_active });
  }

  if (query.role) {
    clauses.push({ role: query.role });
  }

  if (query.search) {
    const s = String(query.search).trim();
    clauses.push({
      OR: [
        { name: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
      ],
    });
  }

  return clauses.length === 1 ? clauses[0] : { AND: clauses };
};

const TeamService = {
  async listTeamMembers(actor, query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });

    let where;
    if (actor.role === 'SHOP_OWNER') {
      const shopId = await assertShopScope(actor);
      where = await buildShopTeamWhere(shopId);
    } else if (actor.role === 'WH_MANAGER') {
      const warehouseId = assertWarehouseScope(actor);
      where = buildWarehouseTeamWhere(warehouseId);
    } else {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }

    where = buildTeamSearchWhere(where, query);

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: [{ is_active: 'desc' }, { created_at: 'desc' }],
        select: {
          ...USER_SELECT,
          warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true } },
          shop: { select: { shop_id: true, shop_code: true, shop_name: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      users,
      creatable_roles: getCreatableRoles(actor.role),
    };
  },

  async createTeamMember(actor, data) {
    assertCreatableRole(actor.role, data.role);

    const payload = {
      name: data.name,
      phone: data.phone,
      password: data.password,
      role: data.role,
      remarks: data.remarks ?? null,
    };

    if (actor.role === 'SHOP_OWNER') {
      payload.shop_id = await assertShopScope(actor);
      payload.warehouse_id = null;
    } else if (actor.role === 'WH_MANAGER') {
      payload.warehouse_id = assertWarehouseScope(actor);
      payload.shop_id = null;
    }

    return UserService.createUser(payload);
  },

  async getTeamMember(actor, userId) {
    if (actor.role === 'SHOP_OWNER') {
      const shopId = await assertShopScope(actor);
      await assertUserInShopTeam(shopId, userId);
    } else if (actor.role === 'WH_MANAGER') {
      const warehouseId = assertWarehouseScope(actor);
      await assertUserInWarehouseTeam(warehouseId, userId);
    } else {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }

    return UserService.getUserById(userId);
  },

  async updateTeamMember(actor, userId, data) {
    const existing = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { user_id: true, role: true, shop_id: true, warehouse_id: true },
    });
    if (!existing) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    if (actor.role === 'SHOP_OWNER') {
      const shopId = await assertShopScope(actor);
      await assertUserInShopTeam(shopId, userId);
    } else if (actor.role === 'WH_MANAGER') {
      const warehouseId = assertWarehouseScope(actor);
      await assertUserInWarehouseTeam(warehouseId, userId);
    } else {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }

    assertEditableTarget(actor, existing);

    const payload = {};
    if (Object.prototype.hasOwnProperty.call(data, 'name')) payload.name = data.name;
    if (Object.prototype.hasOwnProperty.call(data, 'phone')) payload.phone = data.phone;
    if (Object.prototype.hasOwnProperty.call(data, 'remarks')) payload.remarks = data.remarks;

    if (!Object.keys(payload).length) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    return UserService.updateUser(userId, payload);
  },

  async updateTeamMemberStatus(actor, userId, isActive) {
    const existing = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { user_id: true, role: true },
    });
    if (!existing) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    if (actor.role === 'SHOP_OWNER') {
      const shopId = await assertShopScope(actor);
      await assertUserInShopTeam(shopId, userId);
    } else if (actor.role === 'WH_MANAGER') {
      const warehouseId = assertWarehouseScope(actor);
      await assertUserInWarehouseTeam(warehouseId, userId);
    } else {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }

    assertEditableTarget(actor, existing);

    return UserService.updateUserStatus(userId, isActive);
  },

  async resetTeamMemberPassword(actor, userId, newPassword) {
    const existing = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { user_id: true, role: true },
    });
    if (!existing) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

    if (actor.role === 'SHOP_OWNER') {
      const shopId = await assertShopScope(actor);
      await assertUserInShopTeam(shopId, userId);
    } else if (actor.role === 'WH_MANAGER') {
      const warehouseId = assertWarehouseScope(actor);
      await assertUserInWarehouseTeam(warehouseId, userId);
    } else {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }

    assertEditableTarget(actor, existing);

    await UserService.resetUserPassword(userId, newPassword);
    return { user_id: userId };
  },

  /** Metadata for team forms (creatable roles, locked assignment ids). */
  async getTeamContext(actor) {
    if (actor.role === 'SHOP_OWNER') {
      const shopId = await assertShopScope(actor);
      const shop = await prisma.shop.findUnique({
        where: { shop_id: shopId },
        select: { shop_id: true, shop_code: true, shop_name: true },
      });
      return {
        scope: 'shop',
        shop_id: shopId,
        shop,
        creatable_roles: SHOP_OWNER_CREATABLE_ROLES,
      };
    }
    if (actor.role === 'WH_MANAGER') {
      const warehouseId = assertWarehouseScope(actor);
      const warehouse = await prisma.warehouse.findUnique({
        where: { warehouse_id: warehouseId },
        select: { warehouse_id: true, warehouse_code: true, warehouse_name: true },
      });
      return {
        scope: 'warehouse',
        warehouse_id: warehouseId,
        warehouse,
        creatable_roles: WH_MANAGER_CREATABLE_ROLES,
      };
    }
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  },
};

module.exports = TeamService;
