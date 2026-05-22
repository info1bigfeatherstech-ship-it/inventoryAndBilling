const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { assertShopReadAccess, applyShopListScope } = require('../../utils/shopAccess.utils');
const logger = require('../../utils/logger.utils');

const SHOP_SELECT = {
  shop_id: true,
  shop_code: true,
  shop_name: true,
  address: true,
  city: true,
  phone: true,
  email: true,
  owner_user_id: true,
  is_active: true,
  remarks: true,
  created_at: true,
  updated_at: true,
};

const normalizeShopCode = (value) => String(value || '').trim().toUpperCase();

const buildShopWhere = (filters = {}, user) => {
  const where = {};

  if (typeof filters.is_active === 'boolean') {
    where.is_active = filters.is_active;
  }

  if (filters.city) {
    where.city = { contains: String(filters.city).trim(), mode: 'insensitive' };
  }

  if (filters.search) {
    const search = String(filters.search).trim();
    where.OR = [
      { shop_code: { contains: search, mode: 'insensitive' } },
      { shop_name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }

  applyShopListScope(where, user);
  return where;
};

const assertDeactivationAllowed = async (shopId) => {
  const [activeBills, stockWithQty] = await Promise.all([
    prisma.bill.count({
      where: { shop_id: shopId, is_cancelled: false },
    }),
    prisma.shopStock.count({
      where: {
        shop_id: shopId,
        OR: [
          { quantity_available: { gt: 0 } },
          { quantity_reserved: { gt: 0 } },
          { quantity_in_transit: { gt: 0 } },
        ],
      },
    }),
  ]);

  if (activeBills > 0) {
    throw new AppError(
      'Cannot deactivate shop with existing bills. Cancel or archive bills first.',
      409,
      'SHOP_HAS_BILLS'
    );
  }

  if (stockWithQty > 0) {
    throw new AppError(
      'Cannot deactivate shop with non-zero stock. Transfer or adjust stock first.',
      409,
      'SHOP_HAS_STOCK'
    );
  }
};

const ShopService = {
  async createShop(data) {
    const shopCode = normalizeShopCode(data.shop_code);
    if (!shopCode) throw new AppError('shop_code is required', 400, 'SHOP_CODE_REQUIRED');

    const existing = await prisma.shop.findUnique({ where: { shop_code: shopCode } });
    if (existing) throw new AppError(`Shop code "${shopCode}" already exists`, 409, 'SHOP_CODE_EXISTS');

    const shop = await prisma.shop.create({
      data: {
        shop_code: shopCode,
        shop_name: String(data.shop_name).trim(),
        address: String(data.address).trim(),
        city: String(data.city).trim(),
        phone: String(data.phone).trim(),
        email: data.email ? String(data.email).trim().toLowerCase() : null,
        remarks: data.remarks ?? null,
      },
      select: SHOP_SELECT,
    });

    logger.info('Shop created', { shop_id: shop.shop_id, shop_code: shop.shop_code });
    return shop;
  },

  async listShops(query = {}, user) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = buildShopWhere(query, user);

    const [total, shops] = await Promise.all([
      prisma.shop.count({ where }),
      prisma.shop.findMany({
        where,
        skip,
        take,
        orderBy: [{ is_active: 'desc' }, { shop_name: 'asc' }],
        select: SHOP_SELECT,
      }),
    ]);

    return { total, page, limit, shops };
  },

  async getShopById(shopId, user) {
    assertShopReadAccess(shopId, user);

    const shop = await prisma.shop.findUnique({
      where: { shop_id: shopId },
      select: {
        ...SHOP_SELECT,
        _count: { select: { shop_stocks: true, users: true } },
        shop_stocks: {
          take: 5,
          orderBy: { updated_at: 'desc' },
          select: {
            shop_stock_id: true,
            variant_id: true,
            quantity_available: true,
            quantity_reserved: true,
            quantity_in_transit: true,
          },
        },
      },
    });

    if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
    return shop;
  },

  async updateShop(shopId, data) {
    const existing = await prisma.shop.findUnique({
      where: { shop_id: shopId },
      select: { shop_id: true, shop_code: true },
    });
    if (!existing) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');

    const payload = {};
    const allowed = ['shop_name', 'address', 'city', 'phone', 'email', 'is_active', 'remarks'];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(data, key)) payload[key] = data[key];
    }

    if (payload.shop_code !== undefined) {
      throw new AppError('shop_code cannot be changed after creation', 400, 'SHOP_CODE_IMMUTABLE');
    }

    if (payload.is_active === false) {
      await assertDeactivationAllowed(shopId);
    }

    if (!Object.keys(payload).length) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    if (payload.email !== undefined && payload.email !== null) {
      payload.email = String(payload.email).trim().toLowerCase();
    }

    return prisma.shop.update({
      where: { shop_id: shopId },
      data: payload,
      select: SHOP_SELECT,
    });
  },

  async softDeleteShop(shopId) {
    const existing = await prisma.shop.findUnique({
      where: { shop_id: shopId },
      select: { shop_id: true, is_active: true },
    });
    if (!existing) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
    if (!existing.is_active) return { alreadyInactive: true };

    await assertDeactivationAllowed(shopId);

    await prisma.shop.update({
      where: { shop_id: shopId },
      data: { is_active: false },
    });

    logger.info('Shop deactivated', { shop_id: shopId });
    return { alreadyInactive: false };
  },
};

module.exports = ShopService;
