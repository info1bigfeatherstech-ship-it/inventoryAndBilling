const { roundMoney } = require('../../utils/billing.utils');
const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const {
  cacheDel,
  cacheDelByPattern,
  productDetailCacheKey,
  productListCachePattern,
} = require('../../utils/cache.utils');
const logger = require('../../utils/logger.utils');
const { resolveShopIdForUser, assertShopReadAccess } = require('../../utils/shopAccess.utils');
const { resolveOwnerShopId } = require('../../utils/transferRequest.utils');
const {
  generateBulkRequestNumber,
  getBulkRequestedQuantity,
  getDispatchQuantity,
  getBulkItemInTransit,
  isBulkFullyReceived,
  isBulkPartiallyReceived,
} = require('../../utils/bulkTransfer.utils');
const { assertWarehouseAssigned, isWarehouseStaff } = require('../../utils/warehouseAccess.utils');
const {
  normalizeBatch,
  dispatchWhToShop,
  receiveWhToShop,
  dispatchWhToWh,
  receiveWhToWh,
  reverseWhToShopDispatch,
  reverseWhToWhDispatch,
  validateWarehouseStock,
} = require('./transferStock.ops');
const { getWarehouseStockAvailable } = require('../../utils/warehouseStock.utils');
const { snapshotTransferCost } = require('../../utils/transferCost.utils');
const AppSettingsService = require('../settings/appSettings.service');
const {
  snapshotFranchiseTransferPricing,
  isFranchiseShopType,
} = require('../../utils/franchisePrice.utils');
const { formatBulkTransferRequestForUser } = require('../../utils/franchiseTransferPricing.utils');
const TransferBillService = require('./transferBill.service');

const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 };

const USER_BRIEF = { select: { user_id: true, name: true, phone: true, role: true } };

const BULK_SELECT = {
  bulk_request_id: true,
  bulk_request_number: true,
  request_type: true,
  from_warehouse_id: true,
  from_shop_id: true,
  to_shop_id: true,
  to_warehouse_id: true,
  status: true,
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
  receive_remarks: true,
  cancelled_by: true,
  cancelled_at: true,
  cancel_reason: true,
  transfer_bill_type: true,
  transfer_bill_number: true,
  transfer_bill_generated_at: true,
  created_at: true,
  updated_at: true,
  from_warehouse: {
    select: {
      warehouse_id: true,
      warehouse_code: true,
      warehouse_name: true,
      address: true,
      city: true,
      manager_name: true,
      gstin: true,
      legal_name: true,
      state_code: true,
    },
  },
  from_shop: { select: { shop_id: true, shop_code: true, shop_name: true, address: true, city: true } },
  to_shop: { select: { shop_id: true, shop_code: true, shop_name: true, address: true, city: true, pincode: true, phone: true, email: true, state_code: true, shop_type: true } },
  to_warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true, address: true, city: true } },
  requester: USER_BRIEF,
  approver: USER_BRIEF,
  dispatcher: USER_BRIEF,
  receiver: USER_BRIEF,
  items: {
    select: {
      bulk_item_id: true,
      variant_id: true,
      quantity: true,
      requested_quantity: true,
      batch_number: true,
      is_approved: true,
      approved_quantity: true,
      rejection_reason: true,
      received_quantity: true,
      unit_cost_snapshot: true,
      line_value_snapshot: true,
      franchise_markup_percent_snapshot: true,
      franchise_mrp_snapshot: true,
      franchise_unit_price_snapshot: true,
      franchise_line_value_snapshot: true,
      variant: {
        select: {
          variant_id: true,
          sku: true,
          product_code: true,
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
              hsn_code: true,
              expenses: true,
              warranty: true,
            },
          },
        },
      },
    },
  },
};

const invalidateProductCaches = async (productId, warehouseId) => {
  if (!productId || !warehouseId) return;
  await Promise.all([
    cacheDel(productDetailCacheKey(productId)),
    cacheDelByPattern(productListCachePattern(warehouseId)),
  ]);
};

const loadVariant = async (variantId) => {
  const variant = await prisma.productVariant.findUnique({
    where: { variant_id: variantId },
    select: {
      variant_id: true,
      product_id: true,
      is_active: true,
      low_stock_threshold: true,
      purchase_price: true,
      expenses: true,
      mrp: true,
      product: { select: { warehouse_id: true, is_active: true, name: true, expenses: true } },
    },
  });
  if (!variant || !variant.is_active || !variant.product.is_active) {
    throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
  }
  return variant;
};

const assertBulkRead = async (bulk, user) => {
  if (user.role === 'SUPER_ADMIN') return;
  if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
    if (
      user.warehouseId &&
      (bulk.from_warehouse_id === user.warehouseId || bulk.to_warehouse_id === user.warehouseId)
    ) {
      return;
    }
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
  if (user.role === 'SHOP_OWNER') {
    const shopId = await resolveOwnerShopId(user);
    if (shopId === bulk.to_shop_id || shopId === bulk.from_shop_id) return;
  }
  if (user.shopId && (user.shopId === bulk.to_shop_id || user.shopId === bulk.from_shop_id)) return;
  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
};

const buildLineItems = async (items, fromWarehouseId) => {
  const seen = new Set();
  const lineItems = [];
  for (const item of items) {
    if (seen.has(item.variant_id)) {
      throw new AppError(`Duplicate variant in request: ${item.variant_id}`, 400, 'DUPLICATE_VARIANT');
    }
    seen.add(item.variant_id);
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new AppError('Item quantity must be a positive integer', 400, 'TRANSFER_QUANTITY_INVALID');
    }
    const variant = await loadVariant(item.variant_id);
    if (variant.product.warehouse_id !== fromWarehouseId) {
      throw new AppError(
        `Variant ${variant.product.name || item.variant_id} does not belong to source warehouse`,
        409,
        'VARIANT_WAREHOUSE_MISMATCH'
      );
    }
    const batchNumber = normalizeBatch(item.batch_number);
    const available = await getWarehouseStockAvailable(
      prisma,
      item.variant_id,
      fromWarehouseId,
      batchNumber
    );
    if (qty > available) {
      throw new AppError(
        `Insufficient warehouse stock for ${variant.product.name || item.variant_id}. Available: ${available}, requested: ${qty}`,
        409,
        'INSUFFICIENT_STOCK',
        { variant_id: item.variant_id, available, requested: qty, batch_number: batchNumber || null }
      );
    }
    lineItems.push({
      variant_id: item.variant_id,
      quantity: qty,
      requested_quantity: qty,
      batch_number: batchNumber || null,
    });
  }
  return lineItems;
};

const BulkTransferService = {
  async createBulkRequest(data, user) {
    try {
      const requestType = data.request_type || 'WH_TO_SHOP';
      const canCreateShop =
        user.role === 'SUPER_ADMIN' || user.role === 'SHOP_OWNER' || user.role === 'SHOP_MANAGER';
      const canCreateWh =
        user.role === 'SUPER_ADMIN' || isWarehouseStaff(user);

      if (requestType === 'WH_TO_WH') {
        if (!canCreateWh) {
          throw new AppError('Only warehouse staff can create WH→WH bulk requests', 403, 'FORBIDDEN');
        }
      } else if (!canCreateShop) {
        throw new AppError('Only shop owners can create WH→Shop bulk requests', 403, 'FORBIDDEN');
      }

      if (!data.from_warehouse_id) {
        throw new AppError('from_warehouse_id is required', 400, 'WAREHOUSE_ID_REQUIRED');
      }

      if (!Array.isArray(data.items) || data.items.length < 1) {
        throw new AppError('At least one item is required', 400, 'ITEMS_REQUIRED');
      }
      if (data.items.length > 100) {
        throw new AppError('Maximum 100 items per bulk request', 400, 'ITEMS_LIMIT_EXCEEDED');
      }

      const lineItems = await buildLineItems(data.items, data.from_warehouse_id);
      const totalQuantity = lineItems.reduce((s, i) => s + i.quantity, 0);

      const sourceWh = await prisma.warehouse.findUnique({
        where: { warehouse_id: data.from_warehouse_id },
        select: { is_active: true },
      });
      if (!sourceWh?.is_active) throw new AppError('Source warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');

      let createPayload;

      if (requestType === 'WH_TO_WH') {
        assertWarehouseAssigned(user);
        const toWarehouseId =
          user.role === 'SUPER_ADMIN'
            ? data.to_warehouse_id
            : user.warehouseId;
        if (!toWarehouseId) {
          throw new AppError('Destination warehouse is required', 400, 'WAREHOUSE_ID_REQUIRED');
        }
        if (toWarehouseId === data.from_warehouse_id) {
          throw new AppError('Source and destination warehouse must differ', 400, 'SAME_WAREHOUSE');
        }
        const destWh = await prisma.warehouse.findUnique({
          where: { warehouse_id: toWarehouseId },
          select: { is_active: true },
        });
        if (!destWh?.is_active) throw new AppError('Destination warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');

        createPayload = {
          bulk_request_number: null,
          request_type: 'WH_TO_WH',
          from_warehouse_id: data.from_warehouse_id,
          to_warehouse_id: toWarehouseId,
          to_shop_id: null,
          status: 'REQUESTED',
          requested_by: user.userId,
          request_remarks: data.request_remarks?.trim() || null,
          items: { create: lineItems },
        };
      } else {
        const toShopId = resolveShopIdForUser(user, data.to_shop_id);
        assertShopReadAccess(toShopId, user);
        const shop = await prisma.shop.findUnique({
          where: { shop_id: toShopId },
          select: { is_active: true },
        });
        if (!shop?.is_active) throw new AppError('Shop is inactive', 409, 'SHOP_INACTIVE');

        createPayload = {
          bulk_request_number: null,
          request_type: 'WH_TO_SHOP',
          from_warehouse_id: data.from_warehouse_id,
          to_shop_id: toShopId,
          to_warehouse_id: null,
          status: 'REQUESTED',
          requested_by: user.userId,
          request_remarks: data.request_remarks?.trim() || null,
          items: { create: lineItems },
        };
      }

      const created = await prisma.$transaction(async (tx) => {
        const bulkNumber = await generateBulkRequestNumber(tx);
        createPayload.bulk_request_number = bulkNumber;

        return tx.bulkTransferRequest.create({
          data: createPayload,
          select: BULK_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Bulk transfer request created', {
        bulk_request_id: created.bulk_request_id,
        items_count: created.items.length,
        total_quantity: totalQuantity,
        user_id: user.userId,
      });

      return {
        ...created,
        items_count: created.items.length,
        total_quantity: totalQuantity,
      };
    } catch (err) {
      logger.error('createBulkRequest failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },

  async listBulkRequests(filters, user) {
    const { page, limit, skip, take } = parsePagination(filters, { page: 1, limit: 20, maxLimit: 100 });
    const where = {};

    if (user.role === 'SUPER_ADMIN') {
      // all
    } else if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role) && user.warehouseId) {
      where.OR = [
        { from_warehouse_id: user.warehouseId },
        { to_warehouse_id: user.warehouseId },
      ];
    } else if (user.role === 'SHOP_OWNER') {
      const shopId = await resolveOwnerShopId(user);
      if (shopId) where.to_shop_id = shopId;
    } else if (user.shopId) {
      where.to_shop_id = user.shopId;
    }

    if (filters.status) where.status = filters.status;
    if (filters.to_shop_id) where.to_shop_id = filters.to_shop_id;
    // WH staff already scoped by OR (from/to); extra to_warehouse_id would hide outgoing approve queue
    const isWhStaff = ['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role);
    if (filters.to_warehouse_id && !isWhStaff) where.to_warehouse_id = filters.to_warehouse_id;
    if (filters.from_warehouse_id && isWhStaff && user.warehouseId) {
      where.from_warehouse_id = filters.from_warehouse_id;
    }

    const [total, rows] = await Promise.all([
      prisma.bulkTransferRequest.count({ where }),
      prisma.bulkTransferRequest.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: {
          bulk_request_id: true,
          bulk_request_number: true,
          request_type: true,
          status: true,
          requested_at: true,
          transfer_bill_type: true,
          transfer_bill_number: true,
          transfer_bill_generated_at: true,
          from_warehouse: { select: { warehouse_id: true, warehouse_name: true } },
          to_shop: { select: { shop_id: true, shop_name: true, shop_type: true } },
          to_warehouse: { select: { warehouse_id: true, warehouse_name: true } },
          items: { select: { quantity: true, requested_quantity: true, is_approved: true, approved_quantity: true, received_quantity: true } },
        },
      }),
    ]);

    const data = rows.map((row) => {
      const requestedTotal = row.items.reduce(
        (s, i) => s + getBulkRequestedQuantity(i),
        0
      );
      const approvedTotal = row.items.reduce((s, i) => {
        if (i.is_approved === false) return s;
        return s + getDispatchQuantity(i);
      }, 0);
      const receivedTotal = row.items.reduce(
        (s, i) => s + (Number(i.received_quantity) || 0),
        0
      );
      return {
      bulk_request_id: row.bulk_request_id,
      bulk_request_number: row.bulk_request_number,
      request_type: row.request_type,
      from_warehouse_id: row.from_warehouse?.warehouse_id ?? null,
      from_warehouse: row.from_warehouse,
      to_shop_id: row.to_shop?.shop_id ?? null,
      to_shop: row.to_shop,
      to_warehouse_id: row.to_warehouse?.warehouse_id ?? null,
      to_warehouse: row.to_warehouse,
      status: row.status,
      transfer_bill_type: row.transfer_bill_type,
      transfer_bill_number: row.transfer_bill_number,
      transfer_bill_generated_at: row.transfer_bill_generated_at,
      is_franchise_transfer:
        row.request_type === 'WH_TO_SHOP' && row.to_shop?.shop_type === 'FRANCHISE',
      items_count: row.items.length,
      requested_total_quantity: requestedTotal,
      approved_total_quantity: approvedTotal,
      received_total_quantity: receivedTotal,
      total_quantity: approvedTotal,
      requested_at: row.requested_at,
    };
    });

    return { total, page, limit, requests: data };
  },

  async getBulkRequestById(bulkRequestId, user) {
    const bulk = await prisma.bulkTransferRequest.findUnique({
      where: { bulk_request_id: bulkRequestId },
      select: BULK_SELECT,
    });
    if (!bulk) throw new AppError('Bulk transfer request not found', 404, 'BULK_REQUEST_NOT_FOUND');
    await assertBulkRead(bulk, user);
    return formatBulkTransferRequestForUser(bulk, user);
  },

  async approveBulkRequest(bulkRequestId, data, user) {
    try {
      if (!['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
        throw new AppError('Only warehouse staff can approve bulk requests', 403, 'FORBIDDEN');
      }

      const bulk = await prisma.bulkTransferRequest.findUnique({
        where: { bulk_request_id: bulkRequestId },
        include: { items: true },
      });
      if (!bulk) throw new AppError('Bulk transfer request not found', 404, 'BULK_REQUEST_NOT_FOUND');
      if (bulk.status !== 'REQUESTED') {
        throw new AppError('Only REQUESTED bulk requests can be approved', 409, 'INVALID_TRANSFER_STATUS');
      }
      if (
        ['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role) &&
        user.warehouseId !== bulk.from_warehouse_id
      ) {
        throw new AppError('Only source warehouse staff can approve', 403, 'WAREHOUSE_FORBIDDEN');
      }

      const approvalItems = Array.isArray(data.items) ? data.items : null;

      const updated = await prisma.$transaction(async (tx) => {
        if (approvalItems?.length) {
          for (const row of approvalItems) {
            const item = bulk.items.find((i) => i.variant_id === row.variant_id);
            if (!item) continue;

            const approved = row.approved !== false;
            const qty = approved ? Number(row.quantity ?? getBulkRequestedQuantity(item)) : 0;
            if (approved && qty > getBulkRequestedQuantity(item)) {
              throw new AppError(
                `Approved quantity cannot exceed requested quantity for variant ${row.variant_id}`,
                400,
                'INVALID_APPROVED_QUANTITY'
              );
            }

            await tx.bulkTransferRequestItem.update({
              where: { bulk_item_id: item.bulk_item_id },
              data: {
                is_approved: approved && qty > 0,
                approved_quantity: approved && qty > 0 ? qty : 0,
                rejection_reason: approved ? null : row.reason?.trim() || 'Not approved',
              },
            });
          }
        } else {
          await tx.bulkTransferRequestItem.updateMany({
            where: { bulk_request_id: bulkRequestId },
            data: { is_approved: true, approved_quantity: undefined },
          });
          const items = await tx.bulkTransferRequestItem.findMany({ where: { bulk_request_id: bulkRequestId } });
          for (const item of items) {
            await tx.bulkTransferRequestItem.update({
              where: { bulk_item_id: item.bulk_item_id },
              data: { approved_quantity: getBulkRequestedQuantity(item) },
            });
          }
        }

        const approvedCount = await tx.bulkTransferRequestItem.count({
          where: { bulk_request_id: bulkRequestId, is_approved: true, approved_quantity: { gt: 0 } },
        });
        if (approvedCount === 0) {
          throw new AppError('At least one item must be approved', 409, 'NO_APPROVED_ITEMS');
        }

        const approvedItems = await tx.bulkTransferRequestItem.findMany({
          where: { bulk_request_id: bulkRequestId, is_approved: true, approved_quantity: { gt: 0 } },
        });
        for (const item of approvedItems) {
          if (item.unit_cost_snapshot != null && item.line_value_snapshot != null) continue;
          const variant = await loadVariant(item.variant_id);
          const qty = getDispatchQuantity(item);
          const costSnap = snapshotTransferCost(variant, qty);
          await tx.bulkTransferRequestItem.update({
            where: { bulk_item_id: item.bulk_item_id },
            data: {
              unit_cost_snapshot: costSnap.unit_cost,
              line_value_snapshot: costSnap.line_value,
            },
          });
        }

        const billMeta = await TransferBillService.prepareFranchiseApprove(
          tx,
          bulk,
          data.transfer_bill_type
        );

        return tx.bulkTransferRequest.update({
          where: { bulk_request_id: bulkRequestId },
          data: {
            status: 'APPROVED',
            approved_by: user.userId,
            approved_at: new Date(),
            ...(billMeta || {}),
          },
          select: BULK_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Bulk transfer approved', { bulk_request_id: bulkRequestId, user_id: user.userId });
      return formatBulkTransferRequestForUser(updated, user);
    } catch (err) {
      logger.error('approveBulkRequest failed', { bulkRequestId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  async rejectBulkRequest(bulkRequestId, data, user) {
    try {
      if (!['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
        throw new AppError('Only warehouse staff can reject bulk requests', 403, 'FORBIDDEN');
      }

      const bulk = await prisma.bulkTransferRequest.findUnique({
        where: { bulk_request_id: bulkRequestId },
        include: { items: true },
      });
      if (!bulk) throw new AppError('Bulk transfer request not found', 404, 'BULK_REQUEST_NOT_FOUND');
      if (bulk.status !== 'REQUESTED') {
        throw new AppError('Only REQUESTED bulk requests can be rejected', 409, 'INVALID_TRANSFER_STATUS');
      }
      if (
        ['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role) &&
        user.warehouseId !== bulk.from_warehouse_id
      ) {
        throw new AppError('Only source warehouse staff can reject', 403, 'WAREHOUSE_FORBIDDEN');
      }

      const reason = data.rejection_reason?.trim() || data.reject_reason?.trim();
      if (!reason) {
        throw new AppError('Rejection reason is required', 400, 'REJECTION_REASON_REQUIRED');
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.bulkTransferRequestItem.updateMany({
          where: { bulk_request_id: bulkRequestId },
          data: {
            is_approved: false,
            approved_quantity: 0,
            rejection_reason: reason,
          },
        });

        return tx.bulkTransferRequest.update({
          where: { bulk_request_id: bulkRequestId },
          data: {
            status: 'REJECTED',
            approved_by: user.userId,
            approved_at: new Date(),
            rejection_reason: reason,
          },
          select: BULK_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Bulk transfer rejected', { bulk_request_id: bulkRequestId, user_id: user.userId });
      return formatBulkTransferRequestForUser(updated, user);
    } catch (err) {
      logger.error('rejectBulkRequest failed', { bulkRequestId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  async dispatchBulkRequest(bulkRequestId, data, user) {
    try {
      if (!['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
        throw new AppError('Only warehouse staff can dispatch bulk requests', 403, 'FORBIDDEN');
      }

      const bulk = await prisma.bulkTransferRequest.findUnique({
        where: { bulk_request_id: bulkRequestId },
        include: { items: true },
      });
      if (!bulk) throw new AppError('Bulk transfer request not found', 404, 'BULK_REQUEST_NOT_FOUND');
      if (bulk.status !== 'APPROVED') {
        throw new AppError('Bulk request must be APPROVED before dispatch', 409, 'INVALID_TRANSFER_STATUS');
      }
      if (user.role !== 'SUPER_ADMIN' && user.warehouseId !== bulk.from_warehouse_id) {
        throw new AppError('Only source warehouse staff can dispatch', 403, 'WAREHOUSE_FORBIDDEN');
      }

      await prisma.$transaction(async (tx) => {
        const items = await tx.bulkTransferRequestItem.findMany({
          where: { bulk_request_id: bulkRequestId },
        });

        const destShop =
          bulk.request_type === 'WH_TO_SHOP' && bulk.to_shop_id
            ? await tx.shop.findUnique({
                where: { shop_id: bulk.to_shop_id },
                select: { shop_type: true },
              })
            : null;
        const isFranchiseDest = isFranchiseShopType(destShop?.shop_type);
        const franchiseMarkup = isFranchiseDest
          ? await AppSettingsService.getFranchiseMarkupPercent()
          : null;

        for (const item of items) {
          const qty = getDispatchQuantity(item);
          if (qty <= 0) continue;

          const variant = await loadVariant(item.variant_id);
          const batchNumber = normalizeBatch(item.batch_number);

          await validateWarehouseStock(tx, variant.variant_id, bulk.from_warehouse_id, qty, batchNumber);

          const costSnap = snapshotTransferCost(variant, qty);
          let franchiseSnap = {};
          if (isFranchiseDest) {
            const existingFranchise = item.franchise_unit_price_snapshot;
            if (existingFranchise != null) {
              franchiseSnap = {
                franchise_markup_percent_snapshot: item.franchise_markup_percent_snapshot,
                franchise_mrp_snapshot: item.franchise_mrp_snapshot,
                franchise_unit_price_snapshot: item.franchise_unit_price_snapshot,
                franchise_line_value_snapshot: roundMoney(existingFranchise * qty),
              };
            } else {
              const pricingVariant = await tx.productVariant.findUnique({
                where: { variant_id: item.variant_id },
                select: {
                  mrp: true,
                  purchase_price: true,
                  expenses: true,
                  product: { select: { expenses: true } },
                },
              });
              franchiseSnap = snapshotFranchiseTransferPricing(pricingVariant, qty, franchiseMarkup);
            }
          }

          await tx.bulkTransferRequestItem.update({
            where: { bulk_item_id: item.bulk_item_id },
            data: {
              unit_cost_snapshot: costSnap.unit_cost,
              line_value_snapshot: costSnap.line_value,
              ...franchiseSnap,
            },
          });

          const dispatchParams = {
            variant,
            quantity: qty,
            batchNumber,
            referenceId: bulk.bulk_request_id,
            referenceType: 'BULK_TRANSFER_REQUEST',
            createdBy: user.userId,
            remarks: bulk.request_remarks,
            unitCost: costSnap.unit_cost,
            lineValue: costSnap.line_value,
          };

          if (bulk.request_type === 'WH_TO_WH') {
            await dispatchWhToWh(tx, {
              ...dispatchParams,
              fromWarehouseId: bulk.from_warehouse_id,
            });
          } else {
            await dispatchWhToShop(tx, {
              ...dispatchParams,
              fromWarehouseId: bulk.from_warehouse_id,
              toShopId: bulk.to_shop_id,
            });
          }
          await invalidateProductCaches(variant.product_id, bulk.from_warehouse_id);
        }

        await tx.bulkTransferRequest.update({
          where: { bulk_request_id: bulkRequestId },
          data: {
            status: 'DISPATCHED',
            dispatched_by: user.userId,
            dispatched_at: new Date(),
            tracking_number: data.tracking_number?.trim() || null,
            expected_delivery: data.expected_delivery ? new Date(data.expected_delivery) : null,
          },
        });
      }, TX_OPTIONS);

      const updated = await prisma.bulkTransferRequest.findUnique({
        where: { bulk_request_id: bulkRequestId },
        select: BULK_SELECT,
      });

      logger.info('Bulk transfer dispatched', { bulk_request_id: bulkRequestId, user_id: user.userId });
      return formatBulkTransferRequestForUser(updated, user);
    } catch (err) {
      logger.error('dispatchBulkRequest failed', { bulkRequestId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  async receiveBulkRequest(bulkRequestId, data, user) {
    try {
      const bulk = await prisma.bulkTransferRequest.findUnique({
        where: { bulk_request_id: bulkRequestId },
        include: { items: true },
      });
      if (!bulk) throw new AppError('Bulk transfer request not found', 404, 'BULK_REQUEST_NOT_FOUND');
      if (!['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(bulk.status)) {
        throw new AppError('Bulk request is not in a receivable status', 409, 'INVALID_TRANSFER_STATUS');
      }

      if (bulk.request_type === 'WH_TO_WH') {
        if (!['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
          throw new AppError('Only warehouse staff can receive WH→WH bulk transfers', 403, 'FORBIDDEN');
        }
        if (user.role !== 'SUPER_ADMIN' && user.warehouseId !== bulk.to_warehouse_id) {
          throw new AppError('Only destination warehouse staff can receive', 403, 'WAREHOUSE_FORBIDDEN');
        }
      } else {
        if (!['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER'].includes(user.role)) {
          throw new AppError('Only shop owners or managers can receive WH→Shop bulk transfers', 403, 'FORBIDDEN');
        }
        let allowedShop = user.shopId;
        if (user.role === 'SHOP_OWNER') {
          allowedShop = (await resolveOwnerShopId(user)) || user.shopId;
        }
        if (user.role !== 'SUPER_ADMIN' && allowedShop !== bulk.to_shop_id) {
          throw new AppError('Only destination shop owner or manager can receive', 403, 'SHOP_FORBIDDEN');
        }
      }

      const receiveLines = Array.isArray(data.items) ? data.items : null;

      await prisma.$transaction(async (tx) => {
        const items = await tx.bulkTransferRequestItem.findMany({
          where: { bulk_request_id: bulkRequestId },
        });

        for (const item of items) {
          const dispatchQty = getDispatchQuantity(item);
          if (dispatchQty <= 0) continue;

          const lineInput = receiveLines?.find((r) => r.variant_id === item.variant_id);
          const receiveQty =
            lineInput?.received_quantity != null
              ? Number(lineInput.received_quantity)
              : getBulkItemInTransit(item);

          if (!Number.isInteger(receiveQty) || receiveQty < 0) {
            throw new AppError('received_quantity must be a non-negative integer', 400, 'INVALID_QUANTITY');
          }

          const remaining = getBulkItemInTransit(item);
          if (receiveQty > remaining) {
            throw new AppError(
              `Cannot receive more than in-transit for variant ${item.variant_id}. Remaining: ${remaining}`,
              409,
              'RECEIVE_QUANTITY_EXCEEDED'
            );
          }

          if (receiveQty === 0) continue;

          const variant = await loadVariant(item.variant_id);
          const batchNumber = normalizeBatch(item.batch_number);

          if (bulk.request_type === 'WH_TO_WH') {
            await receiveWhToWh(tx, {
              variant,
              toWarehouseId: bulk.to_warehouse_id,
              quantity: receiveQty,
              batchNumber,
              referenceId: bulk.bulk_request_id,
              referenceType: 'BULK_TRANSFER_REQUEST',
              createdBy: user.userId,
              remarks: lineInput?.remarks || data.receive_remarks || null,
            });
            await invalidateProductCaches(variant.product_id, bulk.to_warehouse_id);
          } else {
            await receiveWhToShop(tx, {
              variant,
              fromWarehouseId: bulk.from_warehouse_id,
              toShopId: bulk.to_shop_id,
              quantity: receiveQty,
              batchNumber,
              referenceId: bulk.bulk_request_id,
              referenceType: 'BULK_TRANSFER_REQUEST',
              createdBy: user.userId,
              remarks: lineInput?.remarks || data.receive_remarks || null,
            });
          }

          await tx.bulkTransferRequestItem.update({
            where: { bulk_item_id: item.bulk_item_id },
            data: { received_quantity: { increment: receiveQty } },
          });
        }

        const refreshed = await tx.bulkTransferRequestItem.findMany({
          where: { bulk_request_id: bulkRequestId },
        });

        let status = 'PARTIALLY_RECEIVED';
        if (isBulkFullyReceived(refreshed)) status = 'COMPLETED';
        else if (!isBulkPartiallyReceived(refreshed) && refreshed.some((i) => getBulkItemInTransit(i) > 0)) {
          status = 'DISPATCHED';
        }

        await tx.bulkTransferRequest.update({
          where: { bulk_request_id: bulkRequestId },
          data: {
            status,
            received_by: user.userId,
            received_at: new Date(),
            receive_remarks: data.receive_remarks?.trim() || null,
          },
        });
      }, TX_OPTIONS);

      const updated = await prisma.bulkTransferRequest.findUnique({
        where: { bulk_request_id: bulkRequestId },
        select: BULK_SELECT,
      });

      logger.info('Bulk transfer received', { bulk_request_id: bulkRequestId, status: updated.status });
      return formatBulkTransferRequestForUser(updated, user);
    } catch (err) {
      logger.error('receiveBulkRequest failed', { bulkRequestId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  async cancelBulkRequest(bulkRequestId, data, user) {
    const bulk = await prisma.bulkTransferRequest.findUnique({
      where: { bulk_request_id: bulkRequestId },
      include: { items: true },
    });
    if (!bulk) throw new AppError('Bulk transfer request not found', 404, 'BULK_REQUEST_NOT_FOUND');
    if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(bulk.status)) {
      throw new AppError(`Cannot cancel bulk request in status ${bulk.status}`, 409, 'INVALID_TRANSFER_STATUS');
    }

    if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role) && user.warehouseId) {
      const involved =
        bulk.from_warehouse_id === user.warehouseId || bulk.to_warehouse_id === user.warehouseId;
      if (!involved) throw new AppError('Insufficient permissions to cancel', 403, 'FORBIDDEN');
    }
    if (['SHOP_OWNER', 'SHOP_MANAGER'].includes(user.role)) {
      const shopId =
        user.role === 'SHOP_OWNER' ? (await resolveOwnerShopId(user)) || user.shopId : user.shopId;
      if (shopId !== bulk.to_shop_id) throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }

    const inFlight = ['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(bulk.status);

    await prisma.$transaction(async (tx) => {
      if (inFlight) {
        const items = await tx.bulkTransferRequestItem.findMany({ where: { bulk_request_id: bulkRequestId } });
        for (const item of items) {
          const reverseQty = getBulkItemInTransit(item);
          if (reverseQty <= 0) continue;
          const variant = await loadVariant(item.variant_id);
          const batchNumber = normalizeBatch(item.batch_number);
          if (bulk.request_type === 'WH_TO_WH') {
            await reverseWhToWhDispatch(tx, {
              variant,
              fromWarehouseId: bulk.from_warehouse_id,
              quantity: reverseQty,
              batchNumber,
            });
            await invalidateProductCaches(variant.product_id, bulk.from_warehouse_id);
          } else {
            await reverseWhToShopDispatch(tx, {
              variant,
              fromWarehouseId: bulk.from_warehouse_id,
              toShopId: bulk.to_shop_id,
              quantity: reverseQty,
              batchNumber,
            });
            await invalidateProductCaches(variant.product_id, bulk.from_warehouse_id);
          }
        }
      }

      await tx.bulkTransferRequest.update({
        where: { bulk_request_id: bulkRequestId },
        data: {
          status: 'CANCELLED',
          cancelled_by: user.userId,
          cancelled_at: new Date(),
          cancel_reason: data.cancel_reason?.trim() || null,
        },
      });
    }, TX_OPTIONS);

    return this.getBulkRequestById(bulkRequestId, user);
  },
};

module.exports = BulkTransferService;
