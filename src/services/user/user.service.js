const bcrypt = require('bcryptjs');
const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const { WAREHOUSE_ROLES, SHOP_ROLES } = require('../../validators/user/user.validators');
const { syncShopOwnerAssignment } = require('../../utils/shopOwnerLink.utils');
const { UserRole } = require('../../constants/userRole.constants');
const { mapOrgManagerSchemaError } = require('../../utils/orgRole.utils');
const {
  assertCanMutateAdminUser,
  resolveCreateRoleTitle,
  resolveUpdateRoleTitle,
} = require('../../utils/orgAdminPolicy.utils');

const SALT_ROUNDS = 12;

const USER_SELECT = {
  user_id: true,
  name: true,
  phone: true,
  role: true,
  role_title: true,
  warehouse_id: true,
  shop_id: true,
  is_active: true,
  remarks: true,
  created_at: true,
  updated_at: true,
};

const USER_LIST_RELATIONS = {
  warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true } },
  shop: { select: { shop_id: true, shop_code: true, shop_name: true, shop_type: true } },
  owned_shop: { select: { shop_id: true, shop_code: true, shop_name: true, shop_type: true } },
};

const buildUsersWhere = (query = {}) => {
  const where = {};

  if (typeof query.is_active === 'boolean') where.is_active = query.is_active;
  if (query.role) where.role = query.role;
  if (query.warehouse_id) where.warehouse_id = query.warehouse_id;
  if (query.shop_id) where.shop_id = query.shop_id;

  if (query.search) {
    const s = String(query.search).trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s } },
    ];
  }

  return where;
};

const sanitizeCreate = (data) => ({
  name: data.name,
  phone: data.phone,
  role: data.role,
  warehouse_id: data.warehouse_id ?? null,
  shop_id: data.shop_id ?? null,
  remarks: data.remarks ?? null,
});

const sanitizeUpdate = (data) => {
  const payload = {};
  const allowed = ['name', 'phone', 'role', 'warehouse_id', 'shop_id', 'remarks', 'role_title'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      payload[key] = data[key];
    }
  }
  return payload;
};

const assertEntityActive = async ({ warehouseId, shopId }) => {
  if (warehouseId) {
    const wh = await prisma.warehouse.findUnique({
      where: { warehouse_id: warehouseId },
      select: { warehouse_id: true, is_active: true },
    });
    if (!wh) throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
    if (!wh.is_active) throw new AppError('Warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');
  }

  if (shopId) {
    const shop = await prisma.shop.findUnique({
      where: { shop_id: shopId },
      select: { shop_id: true, is_active: true },
    });
    if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
    if (!shop.is_active) throw new AppError('Shop is inactive', 409, 'SHOP_INACTIVE');
  }
};

const validateRolePolicy = (role, warehouseId, shopId) => {
  if (role === UserRole.SUPER_ADMIN || role === UserRole.ORG_MANAGER) {
    if (warehouseId || shopId) {
      throw new AppError(`${role} cannot have warehouse_id or shop_id`, 400, 'INVALID_ROLE_ASSIGNMENT');
    }
    return;
  }

  if (WAREHOUSE_ROLES.includes(role)) {
    if (!warehouseId) {
      throw new AppError(`${role} requires warehouse_id`, 400, 'INVALID_ROLE_ASSIGNMENT');
    }
    if (shopId) {
      throw new AppError(`${role} cannot be assigned to shop_id`, 400, 'INVALID_ROLE_ASSIGNMENT');
    }
    return;
  }

  if (SHOP_ROLES.includes(role)) {
    // ✅ FIXED: Remove the mandatory shop_id check
    // Allow SHOP_OWNER to be created without shop_id (assign later)
    if (warehouseId) {
      throw new AppError(`${role} cannot be assigned to warehouse_id`, 400, 'INVALID_ROLE_ASSIGNMENT');
    }
    // ⭐ Removed: if (!shopId) throw error
  }
};

const enforceUniqueRoleConstraints = async ({ role, warehouseId, shopId, excludeUserId = null }) => {
  if (role === 'WH_MANAGER' && warehouseId) {
    const existing = await prisma.user.findFirst({
      where: {
        role: 'WH_MANAGER',
        warehouse_id: warehouseId,
        is_active: true,
        ...(excludeUserId ? { NOT: { user_id: excludeUserId } } : {}),
      },
      select: { user_id: true },
    });
    if (existing) {
      throw new AppError('Warehouse already has an active WH_MANAGER', 409, 'WH_MANAGER_ALREADY_ASSIGNED');
    }
  }

  if (role === 'SHOP_OWNER' && shopId) {
    const existing = await prisma.user.findFirst({
      where: {
        role: 'SHOP_OWNER',
        shop_id: shopId,
        is_active: true,
        ...(excludeUserId ? { NOT: { user_id: excludeUserId } } : {}),
      },
      select: { user_id: true },
    });
    if (existing) {
      throw new AppError('Shop already has an active SHOP_OWNER', 409, 'SHOP_OWNER_ALREADY_ASSIGNED');
    }
  }
};

const applyShopOwnerLink = async ({ userId, role, shopId, previousRole, tx = prisma }) => {
  if (role === 'SHOP_OWNER') {
    await syncShopOwnerAssignment({ userId, shopId: shopId || null, tx });
    return;
  }

  if (previousRole === 'SHOP_OWNER') {
    await syncShopOwnerAssignment({ userId, shopId: null, tx });
  }
};

const UserService = {
  async createUser(data, actor) {
    try {
      await assertCanMutateAdminUser(actor, {
        nextRole: data.role,
        nextShopId: data.shop_id ?? null,
      });

      const payload = sanitizeCreate(data);
      payload.role_title = resolveCreateRoleTitle(actor, payload.role, data.role_title);
      validateRolePolicy(payload.role, payload.warehouse_id, payload.shop_id);
      await assertEntityActive({ warehouseId: payload.warehouse_id, shopId: payload.shop_id });
      await enforceUniqueRoleConstraints({
        role: payload.role,
        warehouseId: payload.warehouse_id,
        shopId: payload.shop_id,
      });

      const password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);

      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            ...payload,
            password_hash,
            is_active: true,
          },
          select: USER_SELECT,
        });

        await applyShopOwnerLink({
          userId: created.user_id,
          role: created.role,
          shopId: created.shop_id,
          previousRole: null,
          tx,
        });

        return created;
      });

      return user;
    } catch (err) {
      mapOrgManagerSchemaError(err, 'Failed to create user');
    }
  },

  async listUsers(query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = buildUsersWhere(query);

    try {
      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          skip,
          take,
          orderBy: [{ is_active: 'desc' }, { created_at: 'desc' }],
          select: {
            ...USER_SELECT,
            ...USER_LIST_RELATIONS,
          },
        }),
      ]);

      return { total, page, limit, users };
    } catch (err) {
      mapOrgManagerSchemaError(err, 'Failed to list users');
    }
  },

  async getUserById(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { user_id: userId },
        select: {
          ...USER_SELECT,
          ...USER_LIST_RELATIONS,
        },
      });
      if (!user) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }
      return user;
    } catch (err) {
      mapOrgManagerSchemaError(err, 'Failed to fetch user');
    }
  },

  async updateUser(userId, data, actor) {
    try {
      const existing = await prisma.user.findUnique({
        where: { user_id: userId },
        select: { user_id: true, role: true, warehouse_id: true, shop_id: true, role_title: true },
      });
      if (!existing) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

      const payload = sanitizeUpdate(data);
      if (Object.keys(payload).length === 0) {
        throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
      }

      const role = payload.role ?? existing.role;
      const warehouseId = Object.prototype.hasOwnProperty.call(payload, 'warehouse_id')
        ? (payload.warehouse_id || null)
        : existing.warehouse_id;
      const shopId = Object.prototype.hasOwnProperty.call(payload, 'shop_id')
        ? (payload.shop_id || null)
        : existing.shop_id;

      await assertCanMutateAdminUser(actor, {
        existing,
        nextRole: role,
        nextShopId: shopId,
      });

      const hasTitle = Object.prototype.hasOwnProperty.call(payload, 'role_title');
      const nextTitle = resolveUpdateRoleTitle(actor, {
        existingRole: existing.role,
        nextRole: payload.role,
        nextTitle: payload.role_title,
        hasTitle,
      });
      if (nextTitle === undefined) {
        delete payload.role_title;
      } else {
        payload.role_title = nextTitle;
      }

      validateRolePolicy(role, warehouseId, shopId);
      await assertEntityActive({ warehouseId, shopId });
      await enforceUniqueRoleConstraints({
        role,
        warehouseId,
        shopId,
        excludeUserId: existing.user_id,
      });

      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { user_id: userId },
          data: payload,
          select: USER_SELECT,
        });

        await applyShopOwnerLink({
          userId: updated.user_id,
          role,
          shopId,
          previousRole: existing.role,
          tx,
        });

        return updated;
      });

      return user;
    } catch (err) {
      mapOrgManagerSchemaError(err, 'Failed to update user');
    }
  },

  async updateUserStatus(userId, isActive, actor) {
    const existing = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { user_id: true, role: true, is_active: true, shop_id: true },
    });
    if (!existing) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    if (existing.role === UserRole.SUPER_ADMIN && !isActive) {
      throw new AppError('SUPER_ADMIN cannot be deactivated', 400, 'SUPER_ADMIN_DEACTIVATION_NOT_ALLOWED');
    }
    await assertCanMutateAdminUser(actor, { existing });
    if (existing.is_active === isActive) return { unchanged: true };

    await prisma.user.update({
      where: { user_id: userId },
      data: { is_active: isActive },
      select: { user_id: true },
    });

    return { unchanged: false };
  },

  async resetUserPassword(userId, newPassword, actor) {
    const existing = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { user_id: true, role: true, shop_id: true },
    });
    if (!existing) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    await assertCanMutateAdminUser(actor, { existing });

    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { user_id: userId },
        data: { password_hash },
        select: { user_id: true },
      });

      if (tx.refreshToken) {
        await tx.refreshToken.updateMany({
          where: { user_id: userId, revoked_at: null },
          data: { revoked_at: new Date(), revoked_reason: 'PASSWORD_RESET' },
        });
      }
    });
  },
};

module.exports = UserService;
