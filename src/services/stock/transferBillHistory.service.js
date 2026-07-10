const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { resolveOwnerShopId } = require('../../utils/transferRequest.utils');
const { isFranchiseWhToShopTransfer } = require('../../utils/franchiseTransferPricing.utils');
const TransferBillService = require('./transferBill.service');
const { generateTransferChallanPdf } = require('./transferChallanPdf.service');

const FRANCHISE_BILL_BASE_WHERE = {
  request_type: 'WH_TO_SHOP',
  transfer_bill_number: { not: null },
  to_shop: { shop_type: 'FRANCHISE' },
};

const BULK_BILL_SELECT = {
  bulk_request_id: true,
  bulk_request_number: true,
  transfer_bill_type: true,
  transfer_bill_number: true,
  transfer_bill_generated_at: true,
  status: true,
  from_warehouse_id: true,
  to_shop_id: true,
  from_warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true, city: true } },
  to_shop: { select: { shop_id: true, shop_code: true, shop_name: true, city: true, shop_type: true } },
  items: {
    where: { is_approved: true, approved_quantity: { gt: 0 } },
    select: {
      approved_quantity: true,
      franchise_mrp_snapshot: true,
      franchise_unit_price_snapshot: true,
      franchise_line_value_snapshot: true,
      variant: {
        select: {
          sku: true,
          product_code: true,
          warranty: true,
          attributes: true,
          product: {
            select: {
              name: true,
              brand_name: true,
              hsn_code: true,
              gst_percent: true,
              gst_type: true,
              warranty: true,
            },
          },
        },
      },
    },
  },
};

const SINGLE_BILL_SELECT = {
  request_id: true,
  request_number: true,
  transfer_bill_type: true,
  transfer_bill_number: true,
  transfer_bill_generated_at: true,
  status: true,
  quantity: true,
  from_warehouse_id: true,
  to_shop_id: true,
  franchise_mrp_snapshot: true,
  franchise_unit_price_snapshot: true,
  franchise_line_value_snapshot: true,
  from_warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true, city: true } },
  to_shop: { select: { shop_id: true, shop_code: true, shop_name: true, city: true, shop_type: true } },
  variant: {
    select: {
      sku: true,
      product_code: true,
      warranty: true,
      attributes: true,
      product: {
        select: {
          name: true,
          brand_name: true,
          hsn_code: true,
          gst_percent: true,
          gst_type: true,
          warranty: true,
        },
      },
    },
  },
};

const buildDateFilter = (fromDate, toDate) => {
  if (!fromDate && !toDate) return undefined;
  const filter = {};
  if (fromDate) filter.gte = new Date(fromDate);
  if (toDate) filter.lte = new Date(toDate);
  return filter;
};

const applyRoleScope = async (user, bulkWhere, singleWhere) => {
  if (user.role === 'SUPER_ADMIN') return;

  if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role) && user.warehouseId) {
    bulkWhere.from_warehouse_id = user.warehouseId;
    singleWhere.from_warehouse_id = user.warehouseId;
    return;
  }

  if (user.role === 'SHOP_OWNER') {
    const shopId = await resolveOwnerShopId(user);
    if (!shopId) throw new AppError('Shop not found for user', 403, 'FORBIDDEN');
    bulkWhere.to_shop_id = shopId;
    singleWhere.to_shop_id = shopId;
    return;
  }

  if (user.shopId) {
    bulkWhere.to_shop_id = user.shopId;
    singleWhere.to_shop_id = user.shopId;
    return;
  }

  throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
};

const formatBulkBillRow = async (row) => {
  const totals = await TransferBillService.computeFranchiseBillTotalsFromBulk(row);
  const qty = row.items.reduce((s, i) => s + (Number(i.approved_quantity) || 0), 0);
  return {
    source: 'bulk',
    id: row.bulk_request_id,
    reference_number: row.bulk_request_number,
    transfer_bill_number: row.transfer_bill_number,
    transfer_bill_type: row.transfer_bill_type,
    transfer_bill_generated_at: row.transfer_bill_generated_at,
    status: row.status,
    from_warehouse: row.from_warehouse,
    to_shop: row.to_shop,
    items_count: row.items.length,
    total_quantity: qty,
    franchise_bill_totals: totals,
  };
};

const formatSingleBillRow = async (row) => {
  const totals = await TransferBillService.computeFranchiseBillTotalsFromSingle(row);
  return {
    source: 'single',
    id: row.request_id,
    reference_number: row.request_number,
    transfer_bill_number: row.transfer_bill_number,
    transfer_bill_type: row.transfer_bill_type,
    transfer_bill_generated_at: row.transfer_bill_generated_at,
    status: row.status,
    from_warehouse: row.from_warehouse,
    to_shop: row.to_shop,
    items_count: 1,
    total_quantity: Number(row.quantity) || 0,
    franchise_bill_totals: totals,
  };
};

const SINGLE_BILL_INCLUDE = {
  from_warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true, city: true } },
  to_shop: {
    select: {
      shop_id: true,
      shop_code: true,
      shop_name: true,
      city: true,
      shop_type: true,
    },
  },
  variant: SINGLE_BILL_SELECT.variant,
};

const buildListFilters = async (query, user) => {
  const bulkWhere = { ...FRANCHISE_BILL_BASE_WHERE };
  const singleWhere = { ...FRANCHISE_BILL_BASE_WHERE };
  let includeBulk = true;
  let includeSingle = true;

  const dateFilter = buildDateFilter(query.from_date, query.to_date);
  if (dateFilter) {
    bulkWhere.transfer_bill_generated_at = dateFilter;
    singleWhere.transfer_bill_generated_at = dateFilter;
  }

  if (query.transfer_bill_type) {
    bulkWhere.transfer_bill_type = query.transfer_bill_type;
    singleWhere.transfer_bill_type = query.transfer_bill_type;
  }

  if (query.shop_id) {
    bulkWhere.to_shop_id = query.shop_id;
    singleWhere.to_shop_id = query.shop_id;
  }

  if (query.warehouse_id) {
    bulkWhere.from_warehouse_id = query.warehouse_id;
    singleWhere.from_warehouse_id = query.warehouse_id;
  }

  if (query.source === 'bulk') includeSingle = false;
  if (query.source === 'single') includeBulk = false;

  await applyRoleScope(user, bulkWhere, singleWhere);

  if (query.search) {
    const search = String(query.search).trim();
    const searchOr = [
      { transfer_bill_number: { contains: search, mode: 'insensitive' } },
      { bulk_request_number: { contains: search, mode: 'insensitive' } },
      { to_shop: { shop_name: { contains: search, mode: 'insensitive' } } },
      { from_warehouse: { warehouse_name: { contains: search, mode: 'insensitive' } } },
    ];
    bulkWhere.OR = searchOr;

    singleWhere.OR = [
      { transfer_bill_number: { contains: search, mode: 'insensitive' } },
      { request_number: { contains: search, mode: 'insensitive' } },
      { to_shop: { shop_name: { contains: search, mode: 'insensitive' } } },
      { from_warehouse: { warehouse_name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { bulkWhere, singleWhere, includeBulk, includeSingle };
};

const TransferBillHistoryService = {
  async listTransferBills(query = {}, user) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 20, maxLimit: 100 });
    const { bulkWhere, singleWhere, includeBulk, includeSingle } = await buildListFilters(query, user);

    const fetchSize = skip + take;

    const [bulkCount, singleCount, bulkRows, singleRows] = await Promise.all([
      includeBulk ? prisma.bulkTransferRequest.count({ where: bulkWhere }) : 0,
      includeSingle ? prisma.transferRequest.count({ where: singleWhere }) : 0,
      includeBulk
        ? prisma.bulkTransferRequest.findMany({
            where: bulkWhere,
            take: fetchSize,
            orderBy: { transfer_bill_generated_at: 'desc' },
            select: BULK_BILL_SELECT,
          })
        : [],
      includeSingle
        ? prisma.transferRequest.findMany({
            where: singleWhere,
            take: fetchSize,
            orderBy: { transfer_bill_generated_at: 'desc' },
            select: SINGLE_BILL_SELECT,
          })
        : [],
    ]);

    const merged = [
      ...(await Promise.all(bulkRows.map(formatBulkBillRow))),
      ...(await Promise.all(singleRows.map(formatSingleBillRow))),
    ]
      .sort(
        (a, b) =>
          new Date(b.transfer_bill_generated_at || 0).getTime() -
          new Date(a.transfer_bill_generated_at || 0).getTime()
      )
      .slice(skip, skip + take);

    return {
      total: bulkCount + singleCount,
      page,
      limit,
      bills: merged,
    };
  },

  async getTransferBillSummary(query = {}, user) {
    const { bulkWhere, singleWhere, includeBulk, includeSingle } = await buildListFilters(query, user);

    const [bulkRows, singleRows] = await Promise.all([
      includeBulk
        ? prisma.bulkTransferRequest.findMany({
            where: bulkWhere,
            select: BULK_BILL_SELECT,
          })
        : [],
      includeSingle
        ? prisma.transferRequest.findMany({
            where: singleWhere,
            select: SINGLE_BILL_SELECT,
          })
        : [],
    ]);

    const formatted = [
      ...(await Promise.all(bulkRows.map(formatBulkBillRow))),
      ...(await Promise.all(singleRows.map(formatSingleBillRow))),
    ];

    const isShopView = ['SHOP_OWNER', 'SHOP_MANAGER'].includes(user.role) || Boolean(user.shopId);

    if (isShopView) {
      const byWarehouse = new Map();
      for (const bill of formatted) {
        const whId = bill.from_warehouse?.warehouse_id || 'unknown';
        const existing = byWarehouse.get(whId) || {
          warehouse_id: whId,
          warehouse_name: bill.from_warehouse?.warehouse_name || 'Unknown',
          total_bills: 0,
          total_amount: 0,
        };
        existing.total_bills += 1;
        existing.total_amount += Number(bill.franchise_bill_totals?.final_amount || 0);
        byWarehouse.set(whId, existing);
      }
      return Array.from(byWarehouse.values()).map((row) => ({
        ...row,
        total_amount: Math.round(row.total_amount * 100) / 100,
      }));
    }

    const byShop = new Map();
    for (const bill of formatted) {
      const shopId = bill.to_shop?.shop_id || 'unknown';
      const existing = byShop.get(shopId) || {
        shop_id: shopId,
        shop_name: bill.to_shop?.shop_name || 'Unknown',
        total_bills: 0,
        total_amount: 0,
      };
      existing.total_bills += 1;
      existing.total_amount += Number(bill.franchise_bill_totals?.final_amount || 0);
      byShop.set(shopId, existing);
    }
    return Array.from(byShop.values()).map((row) => ({
      ...row,
      total_amount: Math.round(row.total_amount * 100) / 100,
    }));
  },

  async getTransferBillDetail(source, id, user) {
    if (source === 'bulk') {
      const bulk = await prisma.bulkTransferRequest.findUnique({
        where: { bulk_request_id: id },
        include: {
          from_warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true, city: true } },
          to_shop: {
            select: {
              shop_id: true,
              shop_code: true,
              shop_name: true,
              city: true,
              shop_type: true,
            },
          },
          items: {
            where: { is_approved: true, approved_quantity: { gt: 0 } },
            include: {
              variant: {
                select: {
                  sku: true,
                  product_code: true,
                  warranty: true,
                  attributes: true,
                  product: {
                    select: {
                      name: true,
                      brand_name: true,
                      hsn_code: true,
                      gst_percent: true,
                      gst_type: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!bulk?.transfer_bill_number) {
        throw new AppError('Transfer bill not found', 404, 'TRANSFER_BILL_NOT_FOUND');
      }
      await this.assertBillAccess(bulk, user, 'bulk');
      const doc = await TransferBillService.buildBulkTransferBillDocument(id);
      return {
        ...(await formatBulkBillRow(bulk)),
        lines: doc.lines,
        document: doc,
      };
    }

    if (source === 'single') {
      const request = await prisma.transferRequest.findUnique({
        where: { request_id: id },
        include: SINGLE_BILL_INCLUDE,
      });
      if (!request?.transfer_bill_number) {
        throw new AppError('Transfer bill not found', 404, 'TRANSFER_BILL_NOT_FOUND');
      }
      await this.assertBillAccess(request, user, 'single');
      const doc = await TransferBillService.buildSingleTransferBillDocument(id);
      return {
        ...(await formatSingleBillRow(request)),
        lines: doc.lines,
        document: doc,
      };
    }

    throw new AppError('Invalid bill source', 400, 'INVALID_BILL_SOURCE');
  },

  async assertBillAccess(record, user, source) {
    if (!isFranchiseWhToShopTransfer(record) || !record.transfer_bill_number) {
      throw new AppError('Transfer bill not found', 404, 'TRANSFER_BILL_NOT_FOUND');
    }

    if (user.role === 'SUPER_ADMIN') return;

    if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
      if (user.warehouseId !== record.from_warehouse_id) {
        throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
      }
      return;
    }

    if (user.role === 'SHOP_OWNER') {
      const shopId = await resolveOwnerShopId(user);
      if (shopId !== record.to_shop_id) {
        throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
      }
      return;
    }

    if (user.shopId && user.shopId === record.to_shop_id) return;

    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  },

  async downloadTransferBillPdf(source, id, user) {
    const detail = await this.getTransferBillDetail(source, id, user);
    const { buffer } = await generateTransferChallanPdf(detail.document);
    return {
      buffer,
      filename: `transfer-bill-${detail.transfer_bill_number}.pdf`,
    };
  },
};

module.exports = TransferBillHistoryService;
