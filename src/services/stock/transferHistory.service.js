const prisma = require('../../utils/prisma.utils');
const { parsePagination } = require('../../utils/pagination.utils');
const { resolveOwnerShopId } = require('../../utils/transferRequest.utils');
const {
  applyTransferListScope,
  applyShopOwnerListScope,
} = require('../../utils/transferRequest.utils');
const { getBulkRequestedQuantity, getDispatchQuantity } = require('../../utils/bulkTransfer.utils');

const HISTORY_EXCLUDE_STATUSES = ['REQUESTED'];

const BULK_SUMMARY_SELECT = {
  bulk_request_id: true,
  bulk_request_number: true,
  request_type: true,
  status: true,
  request_remarks: true,
  requested_at: true,
  approved_at: true,
  dispatched_at: true,
  received_at: true,
  updated_at: true,
  transfer_bill_number: true,
  from_warehouse: { select: { warehouse_id: true, warehouse_name: true, warehouse_code: true } },
  from_shop: { select: { shop_id: true, shop_name: true, shop_code: true } },
  to_shop: { select: { shop_id: true, shop_name: true, shop_code: true, shop_type: true } },
  to_warehouse: { select: { warehouse_id: true, warehouse_name: true, warehouse_code: true } },
  items: {
    select: {
      quantity: true,
      requested_quantity: true,
      is_approved: true,
      approved_quantity: true,
      received_quantity: true,
      variant: {
        select: {
          sku: true,
          product_code: true,
          product: { select: { name: true } },
        },
      },
    },
  },
};

const SINGLE_SUMMARY_SELECT = {
  request_id: true,
  request_number: true,
  request_type: true,
  status: true,
  request_remarks: true,
  quantity: true,
  requested_at: true,
  approved_at: true,
  dispatched_at: true,
  received_at: true,
  received_quantity: true,
  updated_at: true,
  transfer_bill_number: true,
  from_warehouse: { select: { warehouse_id: true, warehouse_name: true, warehouse_code: true } },
  from_shop: { select: { shop_id: true, shop_name: true, shop_code: true } },
  to_shop: { select: { shop_id: true, shop_name: true, shop_code: true, shop_type: true } },
  to_warehouse: { select: { warehouse_id: true, warehouse_name: true, warehouse_code: true } },
  variant: {
    select: {
      sku: true,
      product_code: true,
      product: { select: { name: true } },
    },
  },
};

const activityTimestamp = (row) =>
  row.received_at || row.dispatched_at || row.approved_at || row.requested_at || row.updated_at;

const buildBulkHistoryWhere = async (user, filters) => {
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
    if (shopId) {
      where.OR = [{ to_shop_id: shopId }, { from_shop_id: shopId }];
    } else {
      where.bulk_request_id = '__none__';
    }
  } else if (user.shopId) {
    where.OR = [{ to_shop_id: user.shopId }, { from_shop_id: user.shopId }];
  } else {
    where.bulk_request_id = '__none__';
  }

  if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = { notIn: HISTORY_EXCLUDE_STATUSES };
  }

  if (filters.request_type) where.request_type = filters.request_type;

  if (filters.from_date || filters.to_date) {
    where.updated_at = {};
    if (filters.from_date) where.updated_at.gte = new Date(filters.from_date);
    if (filters.to_date) {
      const end = new Date(filters.to_date);
      end.setHours(23, 59, 59, 999);
      where.updated_at.lte = end;
    }
  }

  return where;
};

const buildSingleHistoryWhere = async (user, filters) => {
  const where = applyTransferListScope(user, {});
  await applyShopOwnerListScope(user, where);

  if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = { notIn: HISTORY_EXCLUDE_STATUSES };
  }

  if (filters.request_type) where.request_type = filters.request_type;

  if (filters.from_date || filters.to_date) {
    where.updated_at = {};
    if (filters.from_date) where.updated_at.gte = new Date(filters.from_date);
    if (filters.to_date) {
      const end = new Date(filters.to_date);
      end.setHours(23, 59, 59, 999);
      where.updated_at.lte = end;
    }
  }

  return where;
};

const locationLabel = (warehouse, shop, fallbackId) => {
  if (warehouse?.warehouse_name) return warehouse.warehouse_name;
  if (shop?.shop_name) return shop.shop_name;
  return fallbackId ? String(fallbackId).slice(-8) : '—';
};

const summarizeBulkRow = (row) => {
  const items = row.items || [];
  const itemsCount = items.length;
  const requestedTotal = items.reduce((s, i) => s + getBulkRequestedQuantity(i), 0);
  const approvedTotal = items.reduce((s, i) => {
    if (i.is_approved === false) return s;
    return s + getDispatchQuantity(i);
  }, 0);
  const receivedTotal = items.reduce((s, i) => s + (Number(i.received_quantity) || 0), 0);
  const displayQty =
    receivedTotal > 0 ? receivedTotal : approvedTotal > 0 ? approvedTotal : requestedTotal;

  const firstItem = items[0];
  const firstProductName = firstItem?.variant?.product?.name || null;
  const productSummary =
    itemsCount <= 1
      ? firstProductName || '—'
      : firstProductName
        ? `${firstProductName} +${itemsCount - 1} more`
        : `${itemsCount} products`;

  return {
    source: 'bulk',
    transfer_id: row.bulk_request_id,
    transfer_number: row.bulk_request_number,
    request_type: row.request_type,
    status: row.status,
    from_label: locationLabel(row.from_warehouse, row.from_shop, row.from_warehouse?.warehouse_id),
    to_label: locationLabel(row.to_warehouse, row.to_shop, row.to_shop?.shop_id),
    from_warehouse: row.from_warehouse,
    from_shop: row.from_shop,
    to_warehouse: row.to_warehouse,
    to_shop: row.to_shop,
    items_count: itemsCount,
    total_quantity: displayQty,
    requested_total_quantity: requestedTotal,
    approved_total_quantity: approvedTotal,
    received_total_quantity: receivedTotal,
    product_summary: productSummary,
    transfer_bill_number: row.transfer_bill_number,
    is_franchise_transfer:
      row.request_type === 'WH_TO_SHOP' && row.to_shop?.shop_type === 'FRANCHISE',
    activity_at: activityTimestamp(row),
    remarks: row.request_remarks,
  };
};

const summarizeSingleRow = (row) => {
  const productName = row.variant?.product?.name || '—';
  const code = row.variant?.product_code || row.variant?.sku || '';

  return {
    source: 'single',
    transfer_id: row.request_id,
    transfer_number: row.request_number,
    request_type: row.request_type,
    status: row.status,
    from_label: locationLabel(row.from_warehouse, row.from_shop, row.from_warehouse?.warehouse_id),
    to_label: locationLabel(row.to_warehouse, row.to_shop, row.to_shop?.shop_id),
    from_warehouse: row.from_warehouse,
    from_shop: row.from_shop,
    to_warehouse: row.to_warehouse,
    to_shop: row.to_shop,
    items_count: 1,
    total_quantity: Number(row.quantity) || 0,
    requested_total_quantity: Number(row.quantity) || 0,
    approved_total_quantity: Number(row.quantity) || 0,
    received_total_quantity: Number(row.received_quantity) || 0,
    product_summary: code ? `${productName} (${code})` : productName,
    transfer_bill_number: row.transfer_bill_number,
    is_franchise_transfer:
      row.request_type === 'WH_TO_SHOP' && row.to_shop?.shop_type === 'FRANCHISE',
    activity_at: activityTimestamp(row),
    remarks: row.request_remarks,
  };
};

const TransferHistoryService = {
  async listHistory(filters = {}, user) {
    const { page, limit, skip, take } = parsePagination(filters, { page: 1, limit: 20, maxLimit: 100 });

    const bulkWhere = await buildBulkHistoryWhere(user, filters);
    const singleWhere = await buildSingleHistoryWhere(user, filters);

    const [bulkCount, singleCount, bulkRows, singleRows] = await Promise.all([
      prisma.bulkTransferRequest.count({ where: bulkWhere }),
      prisma.transferRequest.count({ where: singleWhere }),
      prisma.bulkTransferRequest.findMany({
        where: bulkWhere,
        select: BULK_SUMMARY_SELECT,
        orderBy: { updated_at: 'desc' },
        take: 2000,
      }),
      prisma.transferRequest.findMany({
        where: singleWhere,
        select: SINGLE_SUMMARY_SELECT,
        orderBy: { updated_at: 'desc' },
        take: 2000,
      }),
    ]);

    const merged = [
      ...bulkRows.map(summarizeBulkRow),
      ...singleRows.map(summarizeSingleRow),
    ].sort((a, b) => new Date(b.activity_at) - new Date(a.activity_at));

    const total = bulkCount + singleCount;
    const transfers = merged.slice(skip, skip + take);

    return {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      transfers,
    };
  },
};

module.exports = TransferHistoryService;
