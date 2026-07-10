const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { createStockLedgerEntry } = require('./stockLedger.helpers');
const { parsePagination } = require('../../utils/pagination.utils');
const {
  cacheDel,
  cacheDelByPattern,
  productDetailCacheKey,
  productListCachePattern,
} = require('../../utils/cache.utils');
const logger = require('../../utils/logger.utils');
const {
  generateRequestNumber,
  normalizeBatch,
  assertPositiveIntQuantity,
  assertCreateRequestAllowed,
  validateRolePermissions,
  applyTransferListScope,
  applyShopOwnerListScope,
  assertStatus,
  validateStockBeforeDispatch,
  getTotalReceived,
  getInTransitRemaining,
  resolveOwnerShopId,
  TERMINAL_STATUSES,
  IN_FLIGHT_STATUSES,
} = require('../../utils/transferRequest.utils');
const { deductWarehouseStock } = require('../../utils/warehouseStock.utils');
const { snapshotTransferCost } = require('../../utils/transferCost.utils');
const AppSettingsService = require('../settings/appSettings.service');
const {
  snapshotFranchiseTransferPricing,
  isFranchiseShopType,
} = require('../../utils/franchisePrice.utils');
const {
  formatTransferRequestForUser,
  formatTransferRequestsForUser,
} = require('../../utils/franchiseTransferPricing.utils');
const TransferBillService = require('./transferBill.service');

const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 };

const USER_BRIEF = { select: { user_id: true, name: true, phone: true, role: true } };

const REQUEST_SELECT = {
  request_id: true,
  request_number: true,
  request_type: true,
  from_warehouse_id: true,
  to_warehouse_id: true,
  from_shop_id: true,
  to_shop_id: true,
  variant_id: true,
  quantity: true,
  batch_number: true,
  status: true,
  priority: true,
  requested_by: true,
  requested_at: true,
  request_remarks: true,
  approved_by: true,
  approved_at: true,
  rejection_reason: true,
  dispatched_by: true,
  dispatched_at: true,
  tracking_number: true,
  expected_delivery: true,
  received_by: true,
  received_at: true,
  received_quantity: true,
  receive_remarks: true,
  cancelled_by: true,
  cancelled_at: true,
  cancel_reason: true,
  unit_cost_snapshot: true,
  line_value_snapshot: true,
  franchise_markup_percent_snapshot: true,
  franchise_mrp_snapshot: true,
  franchise_unit_price_snapshot: true,
  franchise_line_value_snapshot: true,
  transfer_bill_type: true,
  transfer_bill_number: true,
  transfer_bill_generated_at: true,
  created_at: true,
  updated_at: true,
  variant: {
    select: {
      variant_id: true,
      product_code: true,
      sku: true,
      mrp: true,
      special_price: true,
      purchase_price: true,
      expenses: true,
      warranty: true,
      attributes: true,
      product: {
        select: {
          product_id: true,
          name: true,
          brand_name: true,
          warehouse_id: true,
          hsn_code: true,
          gst_percent: true,
          gst_type: true,
          expenses: true,
          warranty: true,
        },
      },
    },
  },
  from_warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true, address: true, city: true, manager_name: true } },
  to_warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true, address: true, city: true } },
  from_shop: { select: { shop_id: true, shop_code: true, shop_name: true, address: true, city: true, pincode: true, phone: true } },
  to_shop: { select: { shop_id: true, shop_code: true, shop_name: true, address: true, city: true, pincode: true, phone: true, email: true, state_code: true, shop_type: true } },
  requester: USER_BRIEF,
  approver: USER_BRIEF,
  dispatcher: USER_BRIEF,
  receiver: USER_BRIEF,
  canceller: USER_BRIEF,
};

const invalidateProductCaches = async (productId, warehouseId) => {
  if (!productId || !warehouseId) return;
  await Promise.all([
    cacheDel(productDetailCacheKey(productId)),
    cacheDelByPattern(productListCachePattern(warehouseId)),
  ]);
};

const assertWarehouseActive = async (warehouseId) => {
  const wh = await prisma.warehouse.findUnique({
    where: { warehouse_id: warehouseId },
    select: { warehouse_id: true, is_active: true },
  });
  if (!wh) throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  if (!wh.is_active) throw new AppError('Warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');
};

const assertShopActive = async (shopId) => {
  const shop = await prisma.shop.findUnique({
    where: { shop_id: shopId },
    select: { shop_id: true, is_active: true },
  });
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  if (!shop.is_active) throw new AppError('Shop is inactive', 409, 'SHOP_INACTIVE');
};

const loadVariantForTransfer = async (variantId) => {
  const variant = await prisma.productVariant.findUnique({
    where: { variant_id: variantId },
    select: {
      variant_id: true,
      product_id: true,
      is_active: true,
      low_stock_threshold: true,
      purchase_price: true,
      expenses: true,
      sku: true,
      product_code: true,
      mrp: true,
      purchase_price: true,
      expenses: true,
      product: {
        select: {
          warehouse_id: true,
          is_active: true,
          name: true,
          hsn_code: true,
          expenses: true,
        },
      },
    },
  });

  if (!variant || !variant.is_active || !variant.product.is_active) {
    throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
  }

  return variant;
};

const loadRequestOrThrow = async (requestId) => {
  const request = await prisma.transferRequest.findUnique({
    where: { request_id: requestId },
    select: REQUEST_SELECT,
  });
  if (!request) throw new AppError('Transfer request not found', 404, 'TRANSFER_REQUEST_NOT_FOUND');
  return request;
};

const validateCreatePayload = async (data) => {
  const requestType = data.request_type;
  const quantity = assertPositiveIntQuantity(data.quantity);

  if (!['WH_TO_WH', 'WH_TO_SHOP', 'SHOP_TO_SHOP'].includes(requestType)) {
    throw new AppError('Invalid request_type', 400, 'INVALID_REQUEST_TYPE');
  }

  if (requestType === 'WH_TO_WH') {
    if (!data.from_warehouse_id || !data.to_warehouse_id) {
      throw new AppError('from_warehouse_id and to_warehouse_id are required', 400, 'LOCATION_REQUIRED');
    }
    if (data.from_warehouse_id === data.to_warehouse_id) {
      throw new AppError('Source and destination warehouse must differ', 400, 'SAME_LOCATION_TRANSFER');
    }
    await Promise.all([assertWarehouseActive(data.from_warehouse_id), assertWarehouseActive(data.to_warehouse_id)]);
  }

  if (requestType === 'WH_TO_SHOP') {
    if (!data.from_warehouse_id || !data.to_shop_id) {
      throw new AppError('from_warehouse_id and to_shop_id are required', 400, 'LOCATION_REQUIRED');
    }
    await Promise.all([assertWarehouseActive(data.from_warehouse_id), assertShopActive(data.to_shop_id)]);
  }

  if (requestType === 'SHOP_TO_SHOP') {
    if (!data.from_shop_id || !data.to_shop_id) {
      throw new AppError('from_shop_id and to_shop_id are required', 400, 'LOCATION_REQUIRED');
    }
    if (data.from_shop_id === data.to_shop_id) {
      throw new AppError('Source and destination shop must differ', 400, 'SAME_LOCATION_TRANSFER');
    }
    await Promise.all([assertShopActive(data.from_shop_id), assertShopActive(data.to_shop_id)]);
  }

  const variant = await loadVariantForTransfer(data.variant_id);

  if (requestType === 'WH_TO_WH' || requestType === 'WH_TO_SHOP') {
    if (variant.product.warehouse_id !== data.from_warehouse_id) {
      throw new AppError('Variant does not belong to source warehouse', 409, 'VARIANT_WAREHOUSE_MISMATCH');
    }
  }

  return { variant, quantity, batchNumber: normalizeBatch(data.batch_number) };
};

const addWarehouseStock = async (tx, variant, warehouseId, quantity, batchNumber) => {
  return tx.productStock.upsert({
    where: {
      variant_id_warehouse_id_batch_number: {
        variant_id: variant.variant_id,
        warehouse_id: warehouseId,
        batch_number: batchNumber,
      },
    },
    update: { quantity: { increment: quantity } },
    create: {
      variant_id: variant.variant_id,
      product_id: variant.product_id,
      warehouse_id: warehouseId,
      quantity,
      room_zone: 'DEFAULT',
      rack_shelf: 'DEFAULT',
      batch_number: batchNumber,
      low_stock_threshold: variant.low_stock_threshold,
    },
  });
};

const incrementShopInTransit = async (tx, shopId, variantId, quantity, lowStockThreshold) => {
  return tx.shopStock.upsert({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    update: { quantity_in_transit: { increment: quantity } },
    create: {
      shop_id: shopId,
      variant_id: variantId,
      quantity_in_transit: quantity,
      low_stock_threshold: lowStockThreshold ?? 5,
    },
  });
};

const decrementShopInTransit = async (tx, shopId, variantId, quantity) => {
  const row = await tx.shopStock.findUnique({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
  });
  const inTransit = row?.quantity_in_transit ?? 0;
  if (inTransit < quantity) {
    throw new AppError(
      `Insufficient in-transit stock. In transit: ${inTransit}, requested: ${quantity}`,
      409,
      'INSUFFICIENT_IN_TRANSIT',
      { in_transit: inTransit, requested: quantity }
    );
  }
  await tx.shopStock.update({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    data: { quantity_in_transit: { decrement: quantity } },
  });
};

const incrementShopAvailable = async (tx, shopId, variantId, quantity, lowStockThreshold) => {
  return tx.shopStock.upsert({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    update: { quantity_available: { increment: quantity } },
    create: {
      shop_id: shopId,
      variant_id: variantId,
      quantity_available: quantity,
      low_stock_threshold: lowStockThreshold ?? 5,
    },
  });
};

const decrementShopAvailable = async (tx, shopId, variantId, quantity) => {
  const row = await tx.shopStock.findUnique({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
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
  await tx.shopStock.update({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    data: { quantity_available: { decrement: quantity } },
  });
};

const movementTypeForRequest = (requestType) => {
  if (requestType === 'WH_TO_WH') return 'WH_TO_WH';
  if (requestType === 'WH_TO_SHOP') return 'WH_TO_SHOP';
  return 'SHOP_TO_SHOP';
};

const ledgerCostFromRequest = (request) => {
  if (request.unit_cost_snapshot == null) return {};
  return {
    unitCost: request.unit_cost_snapshot,
    lineValue: request.line_value_snapshot ?? null,
  };
};

const performDispatchStock = async (tx, request, variant) => {
  const batchNumber = normalizeBatch(request.batch_number);
  const qty = request.quantity;
  const movementType = movementTypeForRequest(request.request_type);
  const ledgerBase = {
    productId: variant.product_id,
    variantId: variant.variant_id,
    quantity: qty,
    referenceId: request.request_id,
    referenceType: 'TRANSFER_REQUEST',
    batchNumber: batchNumber || null,
    createdBy: request.dispatched_by,
    remarks: request.request_remarks,
    ...ledgerCostFromRequest(request),
  };

  if (request.request_type === 'WH_TO_WH') {
    await deductWarehouseStock(tx, variant.variant_id, request.from_warehouse_id, qty, batchNumber);
    const ledger = await createStockLedgerEntry(tx, {
      ...ledgerBase,
      movementType,
      fromWarehouseId: request.from_warehouse_id,
      createdBy: request.dispatched_by,
    });
    return { ledger_id: ledger.ledger_id };
  }

  if (request.request_type === 'WH_TO_SHOP') {
    await deductWarehouseStock(tx, variant.variant_id, request.from_warehouse_id, qty, batchNumber);
    await incrementShopInTransit(tx, request.to_shop_id, variant.variant_id, qty, variant.low_stock_threshold);
    const ledger = await createStockLedgerEntry(tx, {
      ...ledgerBase,
      movementType,
      movementPhase: 'DISPATCH',
      fromWarehouseId: request.from_warehouse_id,
      toShopId: request.to_shop_id,
      createdBy: request.dispatched_by,
    });
    return { ledger_id: ledger.ledger_id };
  }

  await decrementShopAvailable(tx, request.from_shop_id, variant.variant_id, qty);
  await incrementShopInTransit(tx, request.to_shop_id, variant.variant_id, qty, variant.low_stock_threshold);
  const ledger = await createStockLedgerEntry(tx, {
    ...ledgerBase,
    movementType,
    fromShopId: request.from_shop_id,
    toShopId: request.to_shop_id,
    createdBy: request.dispatched_by,
  });
  return { ledger_id: ledger.ledger_id };
};

const performReceiveStock = async (tx, request, variant, receiveQty) => {
  const batchNumber = normalizeBatch(request.batch_number);
  const movementType = movementTypeForRequest(request.request_type);
  const ledgerBase = {
    productId: variant.product_id,
    variantId: variant.variant_id,
    quantity: receiveQty,
    referenceId: request.request_id,
    referenceType: 'TRANSFER_REQUEST',
    batchNumber: batchNumber || null,
    createdBy: request.received_by,
    remarks: request.receive_remarks,
  };

  if (request.request_type === 'WH_TO_WH') {
    await addWarehouseStock(tx, variant, request.to_warehouse_id, receiveQty, batchNumber);
    const ledger = await createStockLedgerEntry(tx, {
      ...ledgerBase,
      movementType,
      toWarehouseId: request.to_warehouse_id,
    });
    return { ledger_id: ledger.ledger_id };
  }

  if (request.request_type === 'WH_TO_SHOP') {
    await decrementShopInTransit(tx, request.to_shop_id, variant.variant_id, receiveQty);
    await incrementShopAvailable(tx, request.to_shop_id, variant.variant_id, receiveQty, variant.low_stock_threshold);
    const ledger = await createStockLedgerEntry(tx, {
      ...ledgerBase,
      movementType,
      movementPhase: 'RECEIVE',
      fromWarehouseId: request.from_warehouse_id || null,
      toShopId: request.to_shop_id,
    });
    return { ledger_id: ledger.ledger_id };
  }

  await decrementShopInTransit(tx, request.to_shop_id, variant.variant_id, receiveQty);
  await incrementShopAvailable(tx, request.to_shop_id, variant.variant_id, receiveQty, variant.low_stock_threshold);
  const ledger = await createStockLedgerEntry(tx, {
    ...ledgerBase,
    movementType,
    toShopId: request.to_shop_id,
  });
  return { ledger_id: ledger.ledger_id };
};

const performCancelReversal = async (tx, request, variant, reverseQty) => {
  if (reverseQty <= 0) return;

  const batchNumber = normalizeBatch(request.batch_number);

  if (request.request_type === 'WH_TO_WH') {
    await addWarehouseStock(tx, variant, request.from_warehouse_id, reverseQty, batchNumber);
    return;
  }

  if (request.request_type === 'WH_TO_SHOP') {
    await addWarehouseStock(tx, variant, request.from_warehouse_id, reverseQty, batchNumber);
    await decrementShopInTransit(tx, request.to_shop_id, variant.variant_id, reverseQty);
    return;
  }

  await incrementShopAvailable(tx, request.from_shop_id, variant.variant_id, reverseQty, variant.low_stock_threshold);
  await decrementShopInTransit(tx, request.to_shop_id, variant.variant_id, reverseQty);
};

const TransferRequestService = {
  /**
   * Emergency transfer request (HIGH priority, same workflow as standard create).
   */
  async createEmergencyRequest(data, user) {
    return this.createRequest(
      {
        ...data,
        priority: 'HIGH',
        request_remarks: data.request_remarks
          ? `[EMERGENCY] ${data.request_remarks}`
          : '[EMERGENCY] Urgent stock refill',
      },
      user
    );
  },

  /**
   * Create a transfer request (destination initiates — shop owner for WH→Shop).
   */
  async createRequest(data, user) {
    try {
      assertCreateRequestAllowed(data.request_type, user);

      const { variant, quantity, batchNumber } = await validateCreatePayload(data);

      await validateRolePermissions('create_dest', null, user, {
        requestType: data.request_type,
        fromWarehouseId: data.from_warehouse_id,
        toWarehouseId: data.to_warehouse_id,
        fromShopId: data.from_shop_id,
        toShopId: data.to_shop_id,
      });

      const request = await prisma.$transaction(async (tx) => {
        const requestNumber = await generateRequestNumber(tx);

        return tx.transferRequest.create({
          data: {
            request_number: requestNumber,
            request_type: data.request_type,
            from_warehouse_id: data.from_warehouse_id ?? null,
            to_warehouse_id: data.to_warehouse_id ?? null,
            from_shop_id: data.from_shop_id ?? null,
            to_shop_id: data.to_shop_id ?? null,
            variant_id: variant.variant_id,
            quantity,
            batch_number: batchNumber || null,
            status: 'REQUESTED',
            requested_by: user.userId,
            request_remarks: data.request_remarks ?? null,
            priority: data.priority === 'HIGH' ? 'HIGH' : 'NORMAL',
            expected_delivery: data.expected_delivery ? new Date(data.expected_delivery) : null,
          },
          select: REQUEST_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Transfer request created', {
        request_id: request.request_id,
        request_number: request.request_number,
        request_type: request.request_type,
        status: request.status,
        user_id: user.userId,
      });

      return request;
    } catch (err) {
      logger.error('createRequest failed', { error: err.message, stack: err.stack, user_id: user.userId });
      throw err;
    }
  },

  /**
   * List transfer requests with pagination and filters.
   */
  async listRequests(filters, user) {
    try {
      const { page, limit, skip, take } = parsePagination(filters, { page: 1, limit: 20, maxLimit: 100 });

      const where = applyTransferListScope(user, {});
      await applyShopOwnerListScope(user, where);

      if (filters.status) where.status = filters.status;
      if (filters.request_type) where.request_type = filters.request_type;
      if (filters.from_warehouse_id) where.from_warehouse_id = filters.from_warehouse_id;
      if (filters.to_warehouse_id) where.to_warehouse_id = filters.to_warehouse_id;
      if (filters.from_shop_id) where.from_shop_id = filters.from_shop_id;
      if (filters.to_shop_id) where.to_shop_id = filters.to_shop_id;
      if (filters.variant_id) where.variant_id = filters.variant_id;

      const [total, requests] = await Promise.all([
        prisma.transferRequest.count({ where }),
        prisma.transferRequest.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: 'desc' },
          select: REQUEST_SELECT,
        }),
      ]);

      return { total, page, limit, requests: await formatTransferRequestsForUser(requests, user) };
    } catch (err) {
      logger.error('listRequests failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Get a single transfer request by id.
   */
  async getRequestById(requestId, user) {
    try {
      const request = await loadRequestOrThrow(requestId);
      if (user.role !== 'SUPER_ADMIN') {
        const where = {};
        await applyShopOwnerListScope(user, where);
        applyTransferListScope(user, where);
        const scoped = await prisma.transferRequest.findFirst({
          where: { request_id: requestId, ...where },
          select: { request_id: true },
        });
        if (!scoped) throw new AppError('Transfer request not found', 404, 'TRANSFER_REQUEST_NOT_FOUND');
      }
      return formatTransferRequestForUser(request, user);
    } catch (err) {
      logger.error('getRequestById failed', { requestId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Requests where the user is requester or involved as source/dest party.
   */
  async getMyRequests(filters, user) {
    try {
      const { page, limit, skip, take } = parsePagination(filters, { page: 1, limit: 20, maxLimit: 100 });

      const orConditions = [{ requested_by: user.userId }];

      if (user.warehouseId) {
        orConditions.push(
          { from_warehouse_id: user.warehouseId },
          { to_warehouse_id: user.warehouseId }
        );
      }

      const shopId =
        user.role === 'SHOP_OWNER'
          ? await resolveOwnerShopId(user)
          : user.role === 'SHOP_MANAGER'
            ? user.shopId
            : user.shopId;

      if (shopId) {
        orConditions.push({ from_shop_id: shopId }, { to_shop_id: shopId });
      }

      const where = { OR: orConditions };

      const [total, requests] = await Promise.all([
        prisma.transferRequest.count({ where }),
        prisma.transferRequest.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: 'desc' },
          select: REQUEST_SELECT,
        }),
      ]);

      return { total, page, limit, requests: await formatTransferRequestsForUser(requests, user) };
    } catch (err) {
      logger.error('getMyRequests failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Approve a transfer request (source approval).
   */
  async approveRequest(requestId, data, user) {
    try {
      const existing = await loadRequestOrThrow(requestId);
      assertStatus(existing, ['REQUESTED'], 'Only REQUESTED requests can be approved');
      await validateRolePermissions('approve', existing, user);

      const updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.transferRequest.findUnique({ where: { request_id: requestId } });
        if (locked.status !== 'REQUESTED') {
          throw new AppError('Only REQUESTED requests can be approved', 409, 'INVALID_TRANSFER_STATUS');
        }

        const billMeta = await TransferBillService.prepareFranchiseApproveSingle(
          tx,
          locked,
          data.transfer_bill_type
        );

        return tx.transferRequest.update({
          where: { request_id: requestId },
          data: {
            status: 'APPROVED',
            approved_by: user.userId,
            approved_at: new Date(),
            ...(billMeta || {}),
          },
          select: REQUEST_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Transfer request approved', { request_id: requestId, user_id: user.userId });
      return formatTransferRequestForUser(updated, user);
    } catch (err) {
      logger.error('approveRequest failed', { requestId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Reject a transfer request (source).
   */
  async rejectRequest(requestId, data, user) {
    try {
      const existing = await loadRequestOrThrow(requestId);
      assertStatus(existing, ['REQUESTED'], 'Only REQUESTED requests can be rejected');
      await validateRolePermissions('reject', existing, user);

      const updated = await prisma.transferRequest.update({
        where: { request_id: requestId },
        data: {
          status: 'REJECTED',
          approved_by: user.userId,
          approved_at: new Date(),
          rejection_reason: data.rejection_reason?.trim() || null,
        },
        select: REQUEST_SELECT,
      });

      logger.info('Transfer request rejected', { request_id: requestId, user_id: user.userId });
      return updated;
    } catch (err) {
      logger.error('rejectRequest failed', { requestId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Dispatch goods — deduct source stock, add in-transit where applicable.
   */
  async dispatchRequest(requestId, data, user) {
    try {
      const existing = await loadRequestOrThrow(requestId);
      assertStatus(existing, ['APPROVED'], 'Request must be APPROVED before dispatch');
      await validateRolePermissions('dispatch', existing, user);

      const variant = await loadVariantForTransfer(existing.variant_id);

      const result = await prisma.$transaction(async (tx) => {
        const locked = await tx.transferRequest.findUnique({ where: { request_id: requestId } });
        if (locked.status !== 'APPROVED') {
          throw new AppError('Request is no longer in APPROVED status', 409, 'INVALID_TRANSFER_STATUS');
        }

        await validateStockBeforeDispatch(tx, locked);

        const costSnap = snapshotTransferCost(variant, locked.quantity);

        let franchiseSnap = {};
        if (locked.request_type === 'WH_TO_SHOP' && locked.to_shop_id) {
          const destShop = await tx.shop.findUnique({
            where: { shop_id: locked.to_shop_id },
            select: { shop_type: true },
          });
          if (isFranchiseShopType(destShop?.shop_type)) {
            if (locked.franchise_unit_price_snapshot == null) {
              const markup = await AppSettingsService.getFranchiseMarkupPercent();
              const pricingVariant = await tx.productVariant.findUnique({
                where: { variant_id: locked.variant_id },
                select: {
                  mrp: true,
                  purchase_price: true,
                  expenses: true,
                  product: { select: { expenses: true } },
                },
              });
              franchiseSnap = snapshotFranchiseTransferPricing(pricingVariant, locked.quantity, markup);
            }
          }
        }

        await tx.transferRequest.update({
          where: { request_id: requestId },
          data: {
            status: 'DISPATCHED',
            dispatched_by: user.userId,
            dispatched_at: new Date(),
            tracking_number: data.tracking_number?.trim() || null,
            expected_delivery: data.expected_delivery ? new Date(data.expected_delivery) : null,
            unit_cost_snapshot: costSnap.unit_cost,
            line_value_snapshot: costSnap.line_value,
            ...franchiseSnap,
          },
        });

        const dispatchRequest = {
          ...locked,
          dispatched_by: user.userId,
          unit_cost_snapshot: costSnap.unit_cost,
          line_value_snapshot: costSnap.line_value,
        };
        const stockResult = await performDispatchStock(tx, dispatchRequest, variant);

        const updated = await tx.transferRequest.findUnique({
          where: { request_id: requestId },
          select: REQUEST_SELECT,
        });

        return { request: updated, ...stockResult };
      }, TX_OPTIONS);

      if (existing.from_warehouse_id) {
        await invalidateProductCaches(variant.product_id, existing.from_warehouse_id);
      }

      logger.info('Transfer request dispatched', {
        request_id: requestId,
        user_id: user.userId,
        ledger_id: result.ledger_id,
      });

      return formatTransferRequestForUser(result.request, user);
    } catch (err) {
      logger.error('dispatchRequest failed', { requestId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Receive goods at destination (supports partial receive).
   */
  async receiveRequest(requestId, data, user) {
    try {
      const existing = await loadRequestOrThrow(requestId);
      assertStatus(
        existing,
        ['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'],
        'Request must be dispatched before receive'
      );
      await validateRolePermissions('receive', existing, user);

      const receiveQty = data.received_quantity != null
        ? assertPositiveIntQuantity(data.received_quantity, 'received_quantity')
        : getInTransitRemaining(existing);

      const alreadyReceived = getTotalReceived(existing);
      const remaining = getInTransitRemaining(existing);

      if (receiveQty > remaining) {
        throw new AppError(
          `Cannot receive more than in-transit quantity. Remaining: ${remaining}, requested: ${receiveQty}`,
          409,
          'RECEIVE_QUANTITY_EXCEEDED',
          { remaining, requested: receiveQty }
        );
      }

      const variant = await loadVariantForTransfer(existing.variant_id);
      const newTotalReceived = alreadyReceived + receiveQty;
      const isComplete = newTotalReceived >= existing.quantity;
      const newStatus = isComplete ? 'COMPLETED' : 'PARTIALLY_RECEIVED';

      const result = await prisma.$transaction(async (tx) => {
        const locked = await tx.transferRequest.findUnique({ where: { request_id: requestId } });
        if (!['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(locked.status)) {
          throw new AppError('Request is not in a receivable status', 409, 'INVALID_TRANSFER_STATUS');
        }

        const lockedRemaining = getInTransitRemaining(locked);
        if (receiveQty > lockedRemaining) {
          throw new AppError(
            `Cannot receive more than in-transit quantity. Remaining: ${lockedRemaining}`,
            409,
            'RECEIVE_QUANTITY_EXCEEDED'
          );
        }

        await tx.transferRequest.update({
          where: { request_id: requestId },
          data: {
            status: newStatus,
            received_by: user.userId,
            received_at: new Date(),
            received_quantity: newTotalReceived,
            receive_remarks: data.receive_remarks?.trim() || null,
          },
        });

        const receiveCtx = {
          ...locked,
          received_by: user.userId,
          receive_remarks: data.receive_remarks?.trim() || null,
        };
        const stockResult = await performReceiveStock(tx, receiveCtx, variant, receiveQty);

        const updated = await tx.transferRequest.findUnique({
          where: { request_id: requestId },
          select: REQUEST_SELECT,
        });

        return { request: updated, received_quantity: receiveQty, ...stockResult };
      }, TX_OPTIONS);

      if (existing.request_type === 'WH_TO_WH' && existing.to_warehouse_id) {
        await invalidateProductCaches(variant.product_id, existing.to_warehouse_id);
      }
      if (existing.from_warehouse_id) {
        await invalidateProductCaches(variant.product_id, existing.from_warehouse_id);
      }

      logger.info('Transfer request received', {
        request_id: requestId,
        received_quantity: receiveQty,
        status: newStatus,
        user_id: user.userId,
      });

      return result.request;
    } catch (err) {
      logger.error('receiveRequest failed', { requestId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Cancel a transfer request; reverses in-transit stock if already dispatched.
   */
  async cancelRequest(requestId, data, user) {
    try {
      const existing = await loadRequestOrThrow(requestId);

      if (TERMINAL_STATUSES.has(existing.status)) {
        throw new AppError(`Cannot cancel request in status ${existing.status}`, 409, 'INVALID_TRANSFER_STATUS');
      }

      await validateRolePermissions('cancel', existing, user);

      const variant = await loadVariantForTransfer(existing.variant_id);
      const needsReversal = IN_FLIGHT_STATUSES.has(existing.status);
      const reverseQty = needsReversal ? getInTransitRemaining(existing) : 0;

      const updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.transferRequest.findUnique({ where: { request_id: requestId } });
        if (TERMINAL_STATUSES.has(locked.status)) {
          throw new AppError(`Cannot cancel request in status ${locked.status}`, 409, 'INVALID_TRANSFER_STATUS');
        }

        if (IN_FLIGHT_STATUSES.has(locked.status) && reverseQty > 0) {
          await performCancelReversal(tx, locked, variant, reverseQty);
        }

        return tx.transferRequest.update({
          where: { request_id: requestId },
          data: {
            status: 'CANCELLED',
            cancelled_by: user.userId,
            cancelled_at: new Date(),
            cancel_reason: data.cancel_reason?.trim() || null,
          },
          select: REQUEST_SELECT,
        });
      }, TX_OPTIONS);

      if (existing.from_warehouse_id) {
        await invalidateProductCaches(variant.product_id, existing.from_warehouse_id);
      }
      if (existing.to_warehouse_id) {
        await invalidateProductCaches(variant.product_id, existing.to_warehouse_id);
      }

      logger.info('Transfer request cancelled', {
        request_id: requestId,
        reversed_quantity: reverseQty,
        user_id: user.userId,
      });

      return updated;
    } catch (err) {
      logger.error('cancelRequest failed', { requestId, error: err.message, stack: err.stack });
      throw err;
    }
  },
};

module.exports = TransferRequestService;
