const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { resolveShopForOwner } = require('../../utils/shopOwnerLink.utils');
const { BACKUP_ACCESS_ROLES, SCOPE_TYPE } = require('./backup.constants');

const assertBackupAccess = (user) => {
  if (!user?.userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  if (!BACKUP_ACCESS_ROLES.includes(user.role)) {
    throw new AppError('You do not have permission to use backup features', 403, 'FORBIDDEN');
  }
};

const resolveBackupScope = async (user) => {
  assertBackupAccess(user);

  if (user.role === 'SUPER_ADMIN') {
    return {
      type: SCOPE_TYPE.SYSTEM,
      role: user.role,
      shop_id: null,
      warehouse_id: null,
      label: 'full_system',
    };
  }

  if (user.role === 'SHOP_OWNER') {
    const shop = await resolveShopForOwner(user.userId, {
      userShopId: user.shopId,
      repair: true,
      shopSelect: { shop_id: true, shop_name: true },
    });

    if (!shop?.shop_id) {
      throw new AppError('No shop assigned to your account', 404, 'SHOP_NOT_FOUND');
    }

    return {
      type: SCOPE_TYPE.SHOP,
      role: user.role,
      shop_id: shop.shop_id,
      warehouse_id: null,
      label: shop.shop_name || shop.shop_id,
    };
  }

  if (user.role === 'WH_MANAGER' || user.role === 'WH_STOCK_LISTER') {
    if (!user.warehouseId) {
      throw new AppError('No warehouse assigned to your account', 404, 'WAREHOUSE_NOT_FOUND');
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { warehouse_id: user.warehouseId },
      select: { warehouse_id: true, warehouse_name: true },
    });

    if (!warehouse) {
      throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
    }

    return {
      type: SCOPE_TYPE.WAREHOUSE,
      role: user.role,
      shop_id: null,
      warehouse_id: warehouse.warehouse_id,
      label: warehouse.warehouse_name || warehouse.warehouse_id,
    };
  }

  throw new AppError('You do not have permission to use backup features', 403, 'FORBIDDEN');
};

const validateRestoreAgainstScope = (manifestScope, userScope) => {
  if (!manifestScope || !userScope) {
    throw new AppError('Invalid backup manifest scope', 400, 'INVALID_BACKUP');
  }

  if (userScope.type === SCOPE_TYPE.SYSTEM) {
    return;
  }

  if (userScope.type === SCOPE_TYPE.SHOP) {
    if (manifestScope.type !== SCOPE_TYPE.SHOP || manifestScope.shop_id !== userScope.shop_id) {
      throw new AppError(
        'This backup belongs to a different shop and cannot be restored on your account',
        403,
        'BACKUP_SCOPE_MISMATCH'
      );
    }
    return;
  }

  if (userScope.type === SCOPE_TYPE.WAREHOUSE) {
    if (manifestScope.type !== SCOPE_TYPE.WAREHOUSE || manifestScope.warehouse_id !== userScope.warehouse_id) {
      throw new AppError(
        'This backup belongs to a different warehouse and cannot be restored on your account',
        403,
        'BACKUP_SCOPE_MISMATCH'
      );
    }
  }
};

module.exports = {
  assertBackupAccess,
  resolveBackupScope,
  validateRestoreAgainstScope,
};
