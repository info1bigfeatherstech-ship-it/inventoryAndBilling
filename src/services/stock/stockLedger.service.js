// const prisma = require('../../utils/prisma.utils');
// const { parsePagination } = require('../../utils/pagination.utils');
// const { LEDGER_SELECT } = require('./stockLedger.helpers');
// const {applyLedgerScope} =require("../../utils/stockLedgerAccess.utils")
// const buildLedgerWhere = (filters = {}) => {
//   const where = {};

//   if (filters.variant_id) where.variant_id = filters.variant_id;
//   if (filters.product_id) where.product_id = filters.product_id;
//   if (filters.movement_type) where.movement_type = filters.movement_type;
//   if (filters.reference_id) where.reference_id = filters.reference_id;
//   if (filters.reference_type) where.reference_type = filters.reference_type;
//   if (filters.from_warehouse_id) where.from_warehouse_id = filters.from_warehouse_id;
//   if (filters.to_warehouse_id) where.to_warehouse_id = filters.to_warehouse_id;
//   if (filters.from_shop_id) where.from_shop_id = filters.from_shop_id;
//   if (filters.to_shop_id) where.to_shop_id = filters.to_shop_id;

//   if (filters.from_date || filters.to_date) {
//     where.created_at = {};
//     if (filters.from_date) where.created_at.gte = new Date(filters.from_date);
//     if (filters.to_date) where.created_at.lte = new Date(filters.to_date);
//   }

//   return where;
// };

// const StockLedgerService = {
//   async getLedgerEntries(filters = {}, pagination = {}) {
//     const { page, limit, skip, take } = parsePagination(pagination, { page: 1, limit: 50, maxLimit: 200 });
//     let where = buildLedgerWhere(filters);

//     where = applyLedgerScope(where, user); 

//     const [total, entries] = await Promise.all([
//       prisma.stockLedger.count({ where }),
//       prisma.stockLedger.findMany({
//         where,
//         skip,
//         take,
//         orderBy: { created_at: 'desc' },
//         select: LEDGER_SELECT,
//       }),
//     ]);

//     return { total, page, limit, entries };
//   },

//   async getVariantLedger(variantId, dateRange = {}, user) {
//     return this.getLedgerEntries(
//       { variant_id: variantId, from_date: dateRange.from, to_date: dateRange.to },
//       dateRange,
//       user
//     );
//   },

//   async getWarehouseLedger(warehouseId, dateRange = {}, user) {
//       // For warehouse ledger, also apply role-based check
//   if (user.role !== 'SUPER_ADMIN') {
//     if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
//       if (user.warehouseId !== warehouseId) {
//         throw new AppError('Access denied. You can only view your own warehouse ledger.', 403, 'FORBIDDEN');
//       }
//     } else {
//       throw new AppError('Access denied. Only warehouse staff can view warehouse ledger.', 403, 'FORBIDDEN');
//     }
//   }
//     const where = {
//       OR: [{ from_warehouse_id: warehouseId }, { to_warehouse_id: warehouseId }],
//       ...(dateRange.from || dateRange.to
//         ? {
//             created_at: {
//               ...(dateRange.from ? { gte: new Date(dateRange.from) } : {}),
//               ...(dateRange.to ? { lte: new Date(dateRange.to) } : {}),
//             },
//           }
//         : {}),
//     };

//     const { page, limit, skip, take } = parsePagination(dateRange, { page: 1, limit: 50, maxLimit: 200 });

//     const [total, entries] = await Promise.all([
//       prisma.stockLedger.count({ where }),
//       prisma.stockLedger.findMany({
//         where,
//         skip,
//         take,
//         orderBy: { created_at: 'desc' },
//         select: LEDGER_SELECT,
//       }),
//     ]);

//     return { total, page, limit, entries };
//   },

//   async getShopLedger(shopId, dateRange = {}, user) {

//     // For shop ledger, apply role-based check
//   if (user.role !== 'SUPER_ADMIN') {
//     if (['SHOP_OWNER', 'SHOP_STOCK_LISTER', 'BILLING_STAFF'].includes(user.role)) {
//       if (user.shopId !== shopId) {
//         throw new AppError('Access denied. You can only view your own shop ledger.', 403, 'FORBIDDEN');
//       }
//     }
//     // Warehouse roles can view shop ledger (optional)
//   }
//     const where = {
//       OR: [{ from_shop_id: shopId }, { to_shop_id: shopId }],
//       ...(dateRange.from || dateRange.to
//         ? {
//             created_at: {
//               ...(dateRange.from ? { gte: new Date(dateRange.from) } : {}),
//               ...(dateRange.to ? { lte: new Date(dateRange.to) } : {}),
//             },
//           }
//         : {}),
//     };

//     const { page, limit, skip, take } = parsePagination(dateRange, { page: 1, limit: 50, maxLimit: 200 });

//     const [total, entries] = await Promise.all([
//       prisma.stockLedger.count({ where }),
//       prisma.stockLedger.findMany({
//         where,
//         skip,
//         take,
//         orderBy: { created_at: 'desc' },
//         select: LEDGER_SELECT,
//       }),
//     ]);

//     return { total, page, limit, entries };
//   },
// };

// module.exports = StockLedgerService;


const prisma = require('../../utils/prisma.utils');
const { parsePagination } = require('../../utils/pagination.utils');
const { LEDGER_SELECT } = require('./stockLedger.helpers');
const { applyLedgerScope } = require("../../utils/stockLedgerAccess.utils");
const { AppError } = require('../../middlewares/error.middleware');

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

const formatLedgerRow = (row) => {
  const { variant, ...rest } = row;
  return {
    ...rest,
    product_name: variant?.product?.name ?? null,
    product_code: variant?.product?.product_code ?? variant?.product_code ?? null,
    variant_sku: variant?.sku ?? null,
    variant_product_code: variant?.product_code ?? null,
  };
};

const StockLedgerService = {
  async getLedgerEntries(filters = {}, pagination = {}, user) {
    const { page, limit, skip, take } = parsePagination(pagination, { page: 1, limit: 50, maxLimit: 200 });
    let where = buildLedgerWhere(filters);

    where = applyLedgerScope(where, user);
    
    const [total, entries] = await Promise.all([
      prisma.stockLedger.count({ where }),
      prisma.stockLedger.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: {
          ...LEDGER_SELECT,
          variant: {
            select: {
              sku: true,
              product_code: true,
              product: { select: { name: true, product_code: true } },
            },
          },
        },
      }),
    ]);

    const ledger = entries.map(formatLedgerRow);
    return { total, page, limit, entries: ledger };
  },

  async getVariantLedger(variantId, dateRange = {}, user) {
    return this.getLedgerEntries(
      { variant_id: variantId, from_date: dateRange.from, to_date: dateRange.to },
      dateRange,
      user
    );
  },

  async getWarehouseLedger(warehouseId, dateRange = {}, user) {
    // Role-based check for warehouse ledger
    if (user.role !== 'SUPER_ADMIN') {
      if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
        if (user.warehouseId !== warehouseId) {
          throw new AppError('Access denied. You can only view your own warehouse ledger.', 403, 'FORBIDDEN');
        }
      } else {
        throw new AppError('Access denied. Only warehouse staff can view warehouse ledger.', 403, 'FORBIDDEN');
      }
    }
    
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

  async getShopLedger(shopId, dateRange = {}, user) {
    // Role-based check for shop ledger
    if (user.role !== 'SUPER_ADMIN') {
      if (['SHOP_OWNER', 'SHOP_STOCK_LISTER', 'BILLING_STAFF'].includes(user.role)) {
        if (user.shopId !== shopId) {
          throw new AppError('Access denied. You can only view your own shop ledger.', 403, 'FORBIDDEN');
        }
      }
      // Warehouse roles can view shop ledger (optional - remove if not needed)
    }
    
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