const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const { assertShopReadAccess, applyShopListScope } = require('../../utils/shopAccess.utils');
const { normalizeStateCode } = require('../../utils/billing.utils');
const { isValidStateCode } = require('../../constants/indianStateCodes');
const logger = require('../../utils/logger.utils');
const { assertValidGstNumber } = require('../../utils/shopBank.utils');
const {
  syncShopOwnerAssignment,
  clearShopOwnerAssignment,
  resolveShopForOwner,
} = require('../../utils/shopOwnerLink.utils');

const parseShopStateCode = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const code = normalizeStateCode(value);
  if (!isValidStateCode(code)) {
    throw new AppError('state_code must be a valid 2-digit GST state code', 400, 'INVALID_STATE_CODE');
  }
  return code;
};

const SHOP_SELECT = {
  shop_id: true,
  shop_code: true,
  shop_name: true,
  address: true,
  city: true,
  pincode: true,
  state_code: true,
  phone: true,
  email: true,
  owner_user_id: true,
  is_active: true,
  remarks: true,
  sales_channels: true,  
  shop_type: true,
  created_at: true,
  updated_at: true,
};

const normalizeShopCode = (value) => String(value || '').trim().toUpperCase();
const normalizeShopType = (value) => {
  const shopType = String(value || 'OWNER').trim().toUpperCase();
  if (!['OWNER', 'FRANCHISE'].includes(shopType)) {
    throw new AppError('shop_type must be OWNER or FRANCHISE', 400, 'INVALID_SHOP_TYPE');
  }
  return shopType;
};

const DEFAULT_GST_SELECT = {
  where: { is_default: true, is_active: true },
  take: 1,
  select: { gst_config_id: true, gst_number: true, legal_name: true },
};

const OWNER_SHOP_DETAIL_SELECT = {
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
  gst_configs: DEFAULT_GST_SELECT,
};

const attachDefaultGstFields = (shop) => {
  if (!shop) return shop;
  const defaultGst = shop.gst_configs?.[0] ?? null;
  const { gst_configs, ...rest } = shop;
  return {
    ...rest,
    gst_number: defaultGst?.gst_number ?? null,
    default_gst_config_id: defaultGst?.gst_config_id ?? null,
  };
};

const upsertShopDefaultGst = async (shopId, gstNumber, legalName, tx = prisma) => {
  const gst = assertValidGstNumber(gstNumber);
  const existing = await tx.shopGstRegistration.findFirst({
    where: { shop_id: shopId, is_default: true },
    select: { gst_config_id: true, gst_number: true },
  });

  if (existing) {
    if (existing.gst_number !== gst) {
      const conflict = await tx.shopGstRegistration.findUnique({
        where: { shop_id_gst_number: { shop_id: shopId, gst_number: gst } },
        select: { gst_config_id: true },
      });
      if (conflict && conflict.gst_config_id !== existing.gst_config_id) {
        throw new AppError(`GSTIN "${gst}" is already registered for this shop`, 409, 'SHOP_GST_EXISTS');
      }
      await tx.shopGstRegistration.update({
        where: { gst_config_id: existing.gst_config_id },
        data: { gst_number: gst, legal_name: legalName ?? undefined },
      });
    } else if (legalName) {
      await tx.shopGstRegistration.update({
        where: { gst_config_id: existing.gst_config_id },
        data: { legal_name: legalName },
      });
    }
    return existing.gst_config_id;
  }

  const created = await tx.shopGstRegistration.create({
    data: {
      shop_id: shopId,
      gst_number: gst,
      legal_name: legalName ?? null,
      is_default: true,
      is_active: true,
    },
    select: { gst_config_id: true },
  });
  return created.gst_config_id;
};

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
  
    // ⭐ NEW: Validate owner_user_id if provided
    let ownerUserId = null;
    if (data.owner_user_id) {
      const owner = await prisma.user.findUnique({
        where: { user_id: data.owner_user_id, role: 'SHOP_OWNER' },
        select: { user_id: true, role: true },
      });
      
      if (!owner) {
        throw new AppError('Owner user not found or user is not a SHOP_OWNER', 400, 'INVALID_OWNER_USER');
      }
      
      // Check if this user already owns a shop
      const existingOwnerShop = await prisma.shop.findUnique({
        where: { owner_user_id: data.owner_user_id },
        select: { shop_id: true },
      });
      
      if (existingOwnerShop) {
        throw new AppError('User already owns a shop. A user can only own one shop.', 409, 'USER_ALREADY_OWNS_SHOP');
      }
      
      ownerUserId = data.owner_user_id;
    }
  
    if (data.state_code == null || String(data.state_code).trim() === '') {
      throw new AppError('state_code is required', 400, 'STATE_CODE_REQUIRED');
    }

    const shop = await prisma.shop.create({
      data: {
        shop_code: shopCode,
        shop_name: String(data.shop_name).trim(),
        address: String(data.address).trim(),
        city: String(data.city).trim(),
        pincode: data.pincode ? String(data.pincode).trim() : null,
        state_code: parseShopStateCode(data.state_code),
        phone: String(data.phone).trim(),
        email: data.email ? String(data.email).trim().toLowerCase() : null,
        owner_user_id: ownerUserId,
        sales_channels: data.sales_channels || [],
        shop_type: normalizeShopType(data.shop_type),
        remarks: data.remarks ?? null,
      },
      select: SHOP_SELECT,
    });

    if (ownerUserId) {
      await syncShopOwnerAssignment({ userId: ownerUserId, shopId: shop.shop_id });
    }
    if (data.gst_number?.trim()) {
      await upsertShopDefaultGst(shop.shop_id, data.gst_number, data.shop_name);
    }

    logger.info('Shop created', { shop_id: shop.shop_id, shop_code: shop.shop_code, owner_id: ownerUserId });

    const withGst = await prisma.shop.findUnique({
      where: { shop_id: shop.shop_id },
      select: { ...SHOP_SELECT, gst_configs: DEFAULT_GST_SELECT },
    });
    return attachDefaultGstFields(withGst);
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
        select: { ...SHOP_SELECT, gst_configs: DEFAULT_GST_SELECT },
      }),
    ]);

    return { total, page, limit, shops: shops.map(attachDefaultGstFields) };
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
        gst_configs: DEFAULT_GST_SELECT,
      },
    });

    if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
    return attachDefaultGstFields(shop);
  },
  async getShopByOwnerId(ownerUserId, { userShopId = null, repair = false } = {}) {
    const shop = await resolveShopForOwner(ownerUserId, {
      userShopId,
      repair,
      shopSelect: OWNER_SHOP_DETAIL_SELECT,
    });

    if (!shop) {
      throw new AppError('No shop found for this owner', 404, 'SHOP_NOT_FOUND');
    }

    return attachDefaultGstFields(shop);
  },

  async updateShop(shopId, data) {
    const existing = await prisma.shop.findUnique({
      where: { shop_id: shopId },
      select: { shop_id: true, shop_code: true, owner_user_id: true },
    });
    if (!existing) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  
    const payload = {};
    // ⭐ ADD 'owner_user_id' and 'sales_channels' to allowed fields
    const allowed = [
      'shop_name',
      'address',
      'city',
      'pincode',
      'state_code',
      'phone',
      'email',
      'is_active',
      'remarks',
      'owner_user_id',
      'sales_channels',
      'shop_type',
    ];
  
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (key === 'state_code') {
          payload[key] = parseShopStateCode(data.state_code);
        } else if (key === 'shop_type') {
          payload[key] = normalizeShopType(data.shop_type);
        } else {
          payload[key] = data[key];
        }
      }
    }
  
    if (payload.shop_code !== undefined) {
      throw new AppError('shop_code cannot be changed after creation', 400, 'SHOP_CODE_IMMUTABLE');
    }
  
    // ⭐ NEW: Validate owner_user_id if being updated
    if (payload.owner_user_id !== undefined) {
      if (payload.owner_user_id === null) {
        // Allow removing owner
        payload.owner_user_id = null;
      } else {
        const owner = await prisma.user.findUnique({
          where: { user_id: payload.owner_user_id, role: 'SHOP_OWNER' },
          select: { user_id: true },
        });
        
        if (!owner) {
          throw new AppError('Owner user not found or user is not a SHOP_OWNER', 400, 'INVALID_OWNER_USER');
        }
        
        // Check if this user already owns a different shop
        const existingOwnerShop = await prisma.shop.findFirst({
          where: { 
            owner_user_id: payload.owner_user_id,
            shop_id: { not: shopId }
          },
          select: { shop_id: true },
        });
        
        if (existingOwnerShop) {
          throw new AppError('User already owns another shop', 409, 'USER_ALREADY_OWNS_SHOP');
        }
      }
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
  
    // ⭐ NEW: Normalize sales_channels
    if (payload.sales_channels !== undefined && !Array.isArray(payload.sales_channels)) {
      throw new AppError('sales_channels must be an array', 400, 'INVALID_SALES_CHANNELS');
    }
  
    const updated = await prisma.shop.update({
      where: { shop_id: shopId },
      data: payload,
      select: SHOP_SELECT,
    });

    if (Object.prototype.hasOwnProperty.call(payload, 'owner_user_id')) {
      if (payload.owner_user_id === null) {
        await clearShopOwnerAssignment({
          shopId,
          previousOwnerUserId: existing.owner_user_id,
        });
      } else {
        if (existing.owner_user_id && existing.owner_user_id !== payload.owner_user_id) {
          await prisma.user.updateMany({
            where: {
              user_id: existing.owner_user_id,
              shop_id: shopId,
              role: 'SHOP_OWNER',
            },
            data: { shop_id: null },
          });
        }
        await syncShopOwnerAssignment({
          userId: payload.owner_user_id,
          shopId,
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, 'gst_number') && data.gst_number?.trim()) {
      await upsertShopDefaultGst(shopId, data.gst_number, data.shop_name || updated.shop_name);
    }

    const withGst = await prisma.shop.findUnique({
      where: { shop_id: shopId },
      select: { ...SHOP_SELECT, gst_configs: DEFAULT_GST_SELECT },
    });
    return attachDefaultGstFields(withGst);
  },

  async updateMyShop(ownerUserId, data, { userShopId = null } = {}) {
    const shop = await resolveShopForOwner(ownerUserId, {
      userShopId,
      repair: true,
      shopSelect: { shop_id: true, shop_name: true },
    });
    if (!shop) {
      throw new AppError('No shop found for this owner', 404, 'SHOP_NOT_FOUND');
    }

    const restricted = [
      'shop_code',
      'shop_name',
      'owner_user_id',
      'sales_channels',
      'is_active',
      'remarks',
      'state_code',
    ];
    for (const key of restricted) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        throw new AppError(`${key} cannot be updated from shop profile`, 400, 'FIELD_NOT_ALLOWED');
      }
    }

    const allowed = ['address', 'city', 'pincode', 'phone', 'email'];
    const payload = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        payload[key] = data[key];
      }
    }

    if (!Object.keys(payload).length && !Object.prototype.hasOwnProperty.call(data, 'gst_number')) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    if (payload.email !== undefined && payload.email !== null) {
      payload.email = String(payload.email).trim().toLowerCase();
    }

    if (Object.keys(payload).length) {
      await prisma.shop.update({
        where: { shop_id: shop.shop_id },
        data: payload,
      });
    }

    if (Object.prototype.hasOwnProperty.call(data, 'gst_number') && data.gst_number?.trim()) {
      await upsertShopDefaultGst(shop.shop_id, data.gst_number, shop.shop_name);
    }

    return this.getShopByOwnerId(ownerUserId, { userShopId: shop.shop_id, repair: false });
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
