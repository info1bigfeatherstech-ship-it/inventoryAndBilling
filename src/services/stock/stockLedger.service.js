const prisma = require('../../utils/prisma.utils');
const { parsePagination } = require('../../utils/pagination.utils');
const { LEDGER_SELECT } = require('./stockLedger.helpers');

const buildLedgerWhere = (filters = {}) => {
  const where = {};

  if (filters.variant_id) where.variant_id = filters.variant_id;
  if (filters.product_id) where.product_id = filters.product_id;
  if (filters.movement_type) where.movement_type = filters.movement_type;
  if (filters.reference_id) where.reference_id = filters.reference_id;
  if (filters.reference_type) where.reference_type = filters.reference_type;
  if (filters.from_warehouse_id) where.from_warehouse_id = filters.from_warehouse_id;
  if (filters.to_warehouse_id) where.to_warehouse_id = filters.to_warehouse_id;
  if (filters.from_shop_id) where.from_shop_id = filters.from_shop_id;
  if (filters.to_shop_id) where.to_shop_id = filters.to_shop_id;

  if (filters.from_date || filters.to_date) {
    where.created_at = {};
    if (filters.from_date) where.created_at.gte = new Date(filters.from_date);
    if (filters.to_date) where.created_at.lte = new Date(filters.to_date);
  }

  return where;
};

const StockLedgerService = {
  async getLedgerEntries(filters = {}, pagination = {}) {
    const { page, limit, skip, take } = parsePagination(pagination, { page: 1, limit: 50, maxLimit: 200 });
    const where = buildLedgerWhere(filters);

    const [total, entries] = await Promise.all([
      prisma.stockLedger.count({ where }),
      prisma.stockLedger.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: LEDGER_SELECT,
      }),
    ]);

    return { total, page, limit, entries };
  },

  async getVariantLedger(variantId, dateRange = {}) {
    return this.getLedgerEntries(
      { variant_id: variantId, from_date: dateRange.from, to_date: dateRange.to },
      dateRange
    );
  },

  async getWarehouseLedger(warehouseId, dateRange = {}) {
    const where = {
      OR: [{ from_warehouse_id: warehouseId }, { to_warehouse_id: warehouseId }],
      ...(dateRange.from || dateRange.to
        ? {
            created_at: {
              ...(dateRange.from ? { gte: new Date(dateRange.from) } : {}),
              ...(dateRange.to ? { lte: new Date(dateRange.to) } : {}),
            },
          }
        : {}),
    };

    const { page, limit, skip, take } = parsePagination(dateRange, { page: 1, limit: 50, maxLimit: 200 });

    const [total, entries] = await Promise.all([
      prisma.stockLedger.count({ where }),
      prisma.stockLedger.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: LEDGER_SELECT,
      }),
    ]);

    return { total, page, limit, entries };
  },

  async getShopLedger(shopId, dateRange = {}) {
    const where = {
      OR: [{ from_shop_id: shopId }, { to_shop_id: shopId }],
      ...(dateRange.from || dateRange.to
        ? {
            created_at: {
              ...(dateRange.from ? { gte: new Date(dateRange.from) } : {}),
              ...(dateRange.to ? { lte: new Date(dateRange.to) } : {}),
            },
          }
        : {}),
    };

    const { page, limit, skip, take } = parsePagination(dateRange, { page: 1, limit: 50, maxLimit: 200 });

    const [total, entries] = await Promise.all([
      prisma.stockLedger.count({ where }),
      prisma.stockLedger.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: LEDGER_SELECT,
      }),
    ]);

    return { total, page, limit, entries };
  },
};

module.exports = StockLedgerService;
