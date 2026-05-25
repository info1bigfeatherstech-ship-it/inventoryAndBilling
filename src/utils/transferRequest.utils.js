const prisma = require('./prisma.utils');
const { AppError } = require('../errors/AppError');

const TERMINAL_STATUSES = new Set(['REJECTED', 'COMPLETED', 'CANCELLED']);
const PRE_DISPATCH_STATUSES = new Set(['REQUESTED', 'APPROVED']);
const IN_FLIGHT_STATUSES = new Set(['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED']);

/**
 * Generate a unique transfer request number: TR-YYYYMMDD-NNN
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 */
const generateRequestNumber = async (tx = prisma) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `TR-${y}${m}${d}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const count = await tx.transferRequest.count({
    where: {
      created_at: { gte: startOfDay, lt: endOfDay },
    },
  });

  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}${seq}`;
};

/**
 * Resolve shop id for SHOP_OWNER (owned shop or assigned shop_id).
 * @param {object} user
 * @returns {Promise<string|null>}
 */
const resolveOwnerShopId = async (user) => {
  if (user?.role !== 'SHOP_OWNER') return user?.shopId ?? null;

  const owned = await prisma.shop.findUnique({
    where: { owner_user_id: user.userId },
    select: { shop_id: true },
  });

  return owned?.shop_id ?? user.shopId ?? null;
};

const normalizeBatch = (value) => (value != null ? String(value).trim() : '');

const assertPositiveIntQuantity = (quantity, fieldName = 'quantity') => {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new AppError(`${fieldName} must be a positive integer`, 400, 'TRANSFER_QUANTITY_INVALID');
  }
  return qty;
};

/**
 * Cumulative received quantity (0 if never received).
 * @param {object} request
 */
const getTotalReceived = (request) => Number(request.received_quantity ?? 0);

/**
 * Quantity still in transit after partial receives.
 * @param {object} request
 */
const getInTransitRemaining = (request) => {
  const dispatched = Number(request.quantity);
  const received = getTotalReceived(request);
  return Math.max(0, dispatched - received);
};

/**
 * Hard guard: who may initiate a transfer request by type.
 * WH→Shop and Shop→Shop: destination SHOP_OWNER only.
 * WH→WH: destination WH_MANAGER only.
 * @param {string} requestType
 * @param {object} user
 */
const assertCreateRequestAllowed = (requestType, user) => {
  if (user.role === 'SUPER_ADMIN') return;

  if (user.role === 'WH_MANAGER' || user.role === 'WH_STOCK_LISTER') {
    if (requestType === 'WH_TO_SHOP') {
      throw new AppError(
        'Warehouse staff cannot create shop transfer requests. The destination shop owner must request stock from the warehouse.',
        403,
        'FORBIDDEN'
      );
    }
    if (requestType === 'SHOP_TO_SHOP') {
      throw new AppError('Warehouse staff cannot create shop-to-shop transfer requests', 403, 'FORBIDDEN');
    }
    if (requestType !== 'WH_TO_WH') {
      throw new AppError(
        'Warehouse staff can only initiate warehouse-to-warehouse transfer requests',
        403,
        'FORBIDDEN'
      );
    }
    return;
  }

  if (user.role === 'SHOP_OWNER') {
    if (requestType === 'WH_TO_WH') {
      throw new AppError('Shop owners cannot create warehouse-to-warehouse transfer requests', 403, 'FORBIDDEN');
    }
    return;
  }

  throw new AppError('Insufficient permissions to create a transfer request', 403, 'FORBIDDEN');
};

/**
 * Validate user may perform action on a transfer request.
 * @param {'create_dest'|'approve'|'reject'|'dispatch'|'receive'|'cancel'} action
 * @param {object} request - Loaded transfer request row
 * @param {object} user - req.user
 * @param {object} [context] - Optional { requestType, toWarehouseId, toShopId, fromWarehouseId, fromShopId }
 */
const validateRolePermissions = async (action, request, user, context = {}) => {
  if (user.role === 'SUPER_ADMIN') return;

  const type = request?.request_type ?? context.requestType;
  const fromWh = request?.from_warehouse_id ?? context.fromWarehouseId;
  const toWh = request?.to_warehouse_id ?? context.toWarehouseId;
  const fromShop = request?.from_shop_id ?? context.fromShopId;
  const toShop = request?.to_shop_id ?? context.toShopId;

  switch (action) {
    case 'create_dest': {
      if (type === 'WH_TO_WH') {
        if (user.role !== 'WH_MANAGER') {
          throw new AppError('Only warehouse managers can create WH→WH requests', 403, 'FORBIDDEN');
        }
        if (!user.warehouseId || user.warehouseId !== toWh) {
          throw new AppError('You can only create requests for your warehouse as destination', 403, 'WAREHOUSE_FORBIDDEN');
        }
        return;
      }
      if (type === 'WH_TO_SHOP') {
        if (user.role === 'WH_MANAGER' || user.role === 'WH_STOCK_LISTER') {
          throw new AppError(
            'Warehouse staff cannot create shop transfer requests. The destination shop owner must request stock from the warehouse.',
            403,
            'FORBIDDEN'
          );
        }
        if (user.role === 'SHOP_OWNER') {
          const shopId = await resolveOwnerShopId(user);
          if (!shopId || shopId !== toShop) {
            throw new AppError('You can only create stock requests for your own shop', 403, 'SHOP_FORBIDDEN');
          }
          return;
        }
        throw new AppError('Only shop owners can request stock from a warehouse', 403, 'FORBIDDEN');
      }
      if (type === 'SHOP_TO_SHOP') {
        if (user.role !== 'SHOP_OWNER') {
          throw new AppError('Only shop owners can create shop-to-shop requests', 403, 'FORBIDDEN');
        }
        const shopId = await resolveOwnerShopId(user);
        if (!shopId || shopId !== toShop) {
          throw new AppError('You can only create requests for your shop as destination', 403, 'SHOP_FORBIDDEN');
        }
        return;
      }
      break;
    }

    case 'approve':
    case 'reject': {
      if (type === 'WH_TO_WH' || type === 'WH_TO_SHOP') {
        if (!['WH_MANAGER', 'SUPER_ADMIN'].includes(user.role)) {
          throw new AppError(
            'Only the source warehouse manager can approve or reject this request',
            403,
            'FORBIDDEN'
          );
        }
        if (user.role === 'WH_MANAGER' && (!user.warehouseId || user.warehouseId !== fromWh)) {
          throw new AppError('Only source warehouse manager can approve or reject', 403, 'WAREHOUSE_FORBIDDEN');
        }
        return;
      }
      if (type === 'SHOP_TO_SHOP') {
        if (user.role !== 'SHOP_OWNER') {
          throw new AppError('Only shop owners can approve or reject', 403, 'FORBIDDEN');
        }
        const shopId = await resolveOwnerShopId(user);
        if (!shopId || shopId !== fromShop) {
          throw new AppError('Only source shop owner can approve or reject', 403, 'SHOP_FORBIDDEN');
        }
        return;
      }
      break;
    }

    case 'dispatch': {
      if (type === 'WH_TO_WH' || type === 'WH_TO_SHOP') {
        if (!['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
          throw new AppError('Only warehouse staff can dispatch', 403, 'FORBIDDEN');
        }
        if (!user.warehouseId || user.warehouseId !== fromWh) {
          throw new AppError('Only source warehouse staff can dispatch', 403, 'WAREHOUSE_FORBIDDEN');
        }
        return;
      }
      if (type === 'SHOP_TO_SHOP') {
        if (user.role !== 'SHOP_OWNER') {
          throw new AppError('Only shop owners can dispatch', 403, 'FORBIDDEN');
        }
        const shopId = await resolveOwnerShopId(user);
        if (!shopId || shopId !== fromShop) {
          throw new AppError('Only source shop owner can dispatch', 403, 'SHOP_FORBIDDEN');
        }
        return;
      }
      break;
    }

    case 'receive': {
      if (type === 'WH_TO_WH') {
        if (user.role !== 'WH_MANAGER') {
          throw new AppError('Only warehouse managers can receive', 403, 'FORBIDDEN');
        }
        if (!user.warehouseId || user.warehouseId !== toWh) {
          throw new AppError('Only destination warehouse manager can receive', 403, 'WAREHOUSE_FORBIDDEN');
        }
        return;
      }
      if (type === 'WH_TO_SHOP' || type === 'SHOP_TO_SHOP') {
        if (user.role !== 'SHOP_OWNER') {
          throw new AppError('Only shop owners can receive', 403, 'FORBIDDEN');
        }
        const shopId = await resolveOwnerShopId(user);
        if (!shopId || shopId !== toShop) {
          throw new AppError('Only destination shop owner can receive', 403, 'SHOP_FORBIDDEN');
        }
        return;
      }
      break;
    }

    case 'cancel': {
      if (type === 'WH_TO_WH') {
        if (user.role === 'WH_MANAGER' && user.warehouseId && (user.warehouseId === fromWh || user.warehouseId === toWh)) {
          return;
        }
        throw new AppError('Only source or destination warehouse managers can cancel', 403, 'FORBIDDEN');
      }
      if (type === 'WH_TO_SHOP') {
        if (user.role === 'WH_MANAGER' && user.warehouseId === fromWh) return;
        if (user.role === 'SHOP_OWNER') {
          const shopId = await resolveOwnerShopId(user);
          if (shopId === toShop) return;
        }
        throw new AppError('Insufficient permissions to cancel', 403, 'FORBIDDEN');
      }
      if (type === 'SHOP_TO_SHOP') {
        if (user.role === 'SHOP_OWNER') {
          const shopId = await resolveOwnerShopId(user);
          if (shopId === fromShop || shopId === toShop) return;
        }
        throw new AppError('Only source or destination shop owners can cancel', 403, 'FORBIDDEN');
      }
      break;
    }

    default:
      throw new AppError('Unknown permission action', 500, 'INTERNAL_ERROR');
  }

  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
};

/**
 * Build Prisma where clause for role-scoped list queries.
 * @param {object} user
 * @param {object} baseWhere
 */
const applyTransferListScope = (user, baseWhere = {}) => {
  if (user.role === 'SUPER_ADMIN') return baseWhere;

  if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role) && user.warehouseId) {
    baseWhere.OR = [
      { from_warehouse_id: user.warehouseId },
      { to_warehouse_id: user.warehouseId },
    ];
    return baseWhere;
  }

  if (user.role === 'SHOP_OWNER') {
    return baseWhere;
  }

  if (['SHOP_STOCK_LISTER', 'BILLING_STAFF'].includes(user.role)) {
    if (user.shopId) {
      baseWhere.OR = [{ from_shop_id: user.shopId }, { to_shop_id: user.shopId }];
    }
    return baseWhere;
  }

  return baseWhere;
};

/**
 * Apply shop-owner scope asynchronously (needs owned shop lookup).
 */
const applyShopOwnerListScope = async (user, baseWhere = {}) => {
  if (user.role !== 'SHOP_OWNER') return baseWhere;

  const shopId = await resolveOwnerShopId(user);
  if (!shopId) {
    baseWhere.request_id = '__none__';
    return baseWhere;
  }

  baseWhere.OR = [{ from_shop_id: shopId }, { to_shop_id: shopId }];
  return baseWhere;
};

const assertStatus = (request, allowedStatuses, message) => {
  if (!allowedStatuses.includes(request.status)) {
    throw new AppError(
      message || `Invalid status transition from ${request.status}`,
      409,
      'INVALID_TRANSFER_STATUS',
      { current_status: request.status, allowed: allowedStatuses }
    );
  }
};

/**
 * Ensure source has enough stock before dispatch.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} request
 */
const validateStockBeforeDispatch = async (tx, request) => {
  const quantity = Number(request.quantity);

  if (request.request_type === 'SHOP_TO_SHOP') {
    const row = await tx.shopStock.findUnique({
      where: {
        shop_id_variant_id: { shop_id: request.from_shop_id, variant_id: request.variant_id },
      },
    });
    const available = row?.quantity_available ?? 0;
    if (available < quantity) {
      throw new AppError(
        `Insufficient shop stock. Available: ${available}, requested: ${quantity}`,
        409,
        'INSUFFICIENT_STOCK',
        { available, requested: quantity }
      );
    }
    return;
  }

  const batchNumber = normalizeBatch(request.batch_number);
  const row = await tx.productStock.findUnique({
    where: {
      variant_id_warehouse_id_batch_number: {
        variant_id: request.variant_id,
        warehouse_id: request.from_warehouse_id,
        batch_number: batchNumber,
      },
    },
  });
  const available = row?.quantity ?? 0;
  if (available < quantity) {
    throw new AppError(
      `Insufficient warehouse stock. Available: ${available}, requested: ${quantity}`,
      409,
      'INSUFFICIENT_STOCK',
      { available, requested: quantity, batch_number: batchNumber }
    );
  }
};

module.exports = {
  TERMINAL_STATUSES,
  PRE_DISPATCH_STATUSES,
  IN_FLIGHT_STATUSES,
  generateRequestNumber,
  resolveOwnerShopId,
  normalizeBatch,
  assertPositiveIntQuantity,
  assertCreateRequestAllowed,
  getTotalReceived,
  getInTransitRemaining,
  validateRolePermissions,
  applyTransferListScope,
  applyShopOwnerListScope,
  assertStatus,
  validateStockBeforeDispatch,
};
