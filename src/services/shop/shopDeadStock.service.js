const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { assertShopReadAccess, resolveShopIdForUser } = require('../../utils/shopAccess.utils');
const { SHOP_STAFF_ROLES } = require('../../constants/userRole.constants');

const ENTRY_INCLUDE = {
  shop: { select: { shop_id: true, shop_code: true, shop_name: true } },
  createdByUser: { select: { user_id: true, name: true, phone: true, role: true } },
};

const formatEntry = (row, currentStockMap) => {
  const key = `${row.shop_id}:${row.variant_id}`;
  const current = currentStockMap.has(key) ? currentStockMap.get(key) : 0;
  return {
    dead_stock_id: row.dead_stock_id,
    shop_id: row.shop_id,
    shop: row.shop,
    product_id: row.product_id,
    variant_id: row.variant_id,
    product_name: row.product_name_snapshot,
    product_code: row.product_code_snapshot,
    quantity_before: row.quantity_before,
    quantity_reduced: row.quantity_reduced,
    quantity_after: row.quantity_after,
    current_stock: current,
    reason: row.reason,
    created_by: row.created_by,
    created_by_user: row.createdByUser
      ? {
          user_id: row.createdByUser.user_id,
          name: row.createdByUser.name,
          phone: row.createdByUser.phone,
          role: row.createdByUser.role,
        }
      : null,
    created_at: row.created_at,
  };
};

const ShopDeadStockService = {
  async listEntries(query, user) {
    // Shop users always see only their own shop; never another shop's dead stock.
    const isShopStaff = SHOP_STAFF_ROLES.includes(user?.role);
    if (isShopStaff) {
      if (!user.shopId) {
        throw new AppError('User is not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
      }
      if (query.shop_id && query.shop_id !== user.shopId) {
        throw new AppError('You can only view dead stock for your own shop', 403, 'SHOP_FORBIDDEN');
      }
    }

    const { page, limit, skip, take } = parsePagination(query);
    const shopId = resolveShopIdForUser(user, isShopStaff ? user.shopId : query.shop_id);
    assertShopReadAccess(shopId, user);

    const where = { shop_id: shopId };

    if (query.from_date || query.to_date) {
      where.created_at = {};
      if (query.from_date) {
        const from = new Date(query.from_date);
        if (!Number.isNaN(from.getTime())) where.created_at.gte = from;
      }
      if (query.to_date) {
        const to = new Date(query.to_date);
        if (!Number.isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          where.created_at.lte = to;
        }
      }
    }

    const search = String(query.search || '').trim();
    if (search) {
      where.OR = [
        { product_name_snapshot: { contains: search, mode: 'insensitive' } },
        { product_code_snapshot: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.shopDeadStockEntry.count({ where }),
      prisma.shopDeadStockEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
    ]);

    const variantIds = [...new Set(rows.map((r) => r.variant_id).filter(Boolean))];
    const currentStockMap = new Map();
    if (variantIds.length) {
      const stocks = await prisma.shopStock.findMany({
        where: { shop_id: shopId, variant_id: { in: variantIds } },
        select: { shop_id: true, variant_id: true, quantity_available: true },
      });
      for (const s of stocks) {
        currentStockMap.set(`${s.shop_id}:${s.variant_id}`, s.quantity_available ?? 0);
      }
    }

    return {
      total,
      page,
      limit,
      entries: rows.map((row) => formatEntry(row, currentStockMap)),
    };
  },
};

module.exports = ShopDeadStockService;
