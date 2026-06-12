const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { resolveSyncShopId } = require('./syncAccess.utils');
const {
  SYNC_API_VERSION,
  SYNC_DEFAULT_PAGE_LIMIT,
  SYNC_MAX_PAGE_LIMIT,
  SYNC_PULL_SECTIONS,
} = require('./sync.constants');

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
  sales_channels: true,
  is_active: true,
  updated_at: true,
};

const GST_CONFIG_SELECT = {
  gst_config_id: true,
  shop_id: true,
  gst_number: true,
  legal_name: true,
  is_default: true,
  is_active: true,
  updated_at: true,
};

const BANK_ACCOUNT_SELECT = {
  bank_account_id: true,
  gst_config_id: true,
  account_holder_name: true,
  bank_name: true,
  branch_name: true,
  account_number: true,
  ifsc_code: true,
  upi_id: true,
  is_default: true,
  is_active: true,
  updated_at: true,
};

const STAFF_CODE_SELECT = {
  staff_code_id: true,
  shop_id: true,
  code: true,
  display_name: true,
  phone: true,
  is_active: true,
  updated_at: true,
};

const SHOP_STOCK_SYNC_SELECT = {
  shop_stock_id: true,
  shop_id: true,
  variant_id: true,
  quantity_available: true,
  quantity_reserved: true,
  quantity_in_transit: true,
  low_stock_threshold: true,
  updated_at: true,
  variant: {
    select: {
      variant_id: true,
      product_id: true,
      sku: true,
      product_code: true,
      system_barcode: true,
      mrp: true,
      special_price: true,
      purchase_price: true,
      expenses: true,
      purchase_code: true,
      is_active: true,
      updated_at: true,
      images: {
        orderBy: { sort_order: 'asc' },
        take: 1,
        select: { url: true, alt_text: true },
      },
      product: {
        select: {
          product_id: true,
          product_code: true,
          name: true,
          brand_name: true,
          hsn_code: true,
          gst_percent: true,
          gst_type: true,
          is_active: true,
          updated_at: true,
        },
      },
    },
  },
};

const CUSTOMER_SYNC_SELECT = {
  customer_id: true,
  mobile: true,
  name: true,
  email: true,
  gst_number: true,
  address: true,
  city: true,
  state_code: true,
  pincode: true,
  total_spent: true,
  total_orders: true,
  last_purchase: true,
  loyalty_tier: true,
  credit_limit: true,
  credit_balance: true,
  credit_used: true,
  is_active: true,
  remarks: true,
  updated_at: true,
};

const parseLimit = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return SYNC_DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(n), SYNC_MAX_PAGE_LIMIT);
};

const parseSections = (raw) => {
  if (!raw) return [...SYNC_PULL_SECTIONS];
  const requested = String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const invalid = requested.filter((s) => !SYNC_PULL_SECTIONS.includes(s));
  if (invalid.length) {
    throw new AppError(
      `Invalid sync sections: ${invalid.join(', ')}. Allowed: ${SYNC_PULL_SECTIONS.join(', ')}`,
      400,
      'INVALID_SYNC_SECTIONS'
    );
  }
  return requested.length ? requested : [...SYNC_PULL_SECTIONS];
};

const parseSince = (raw) => {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new AppError('since must be a valid ISO-8601 timestamp', 400, 'INVALID_SINCE');
  }
  return d;
};

const pullConfig = async (shopId) => {
  const shop = await prisma.shop.findUnique({
    where: { shop_id: shopId },
    select: SHOP_SELECT,
  });

  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  if (!shop.is_active) throw new AppError('Shop is inactive', 409, 'SHOP_INACTIVE');

  const [gst_configs, bank_accounts, staff_codes] = await Promise.all([
    prisma.shopGstRegistration.findMany({
      where: { shop_id: shopId, is_active: true },
      orderBy: [{ is_default: 'desc' }, { gst_number: 'asc' }],
      select: GST_CONFIG_SELECT,
    }),
    prisma.shopBankAccount.findMany({
      where: {
        is_active: true,
        gst_config: { shop_id: shopId, is_active: true },
      },
      orderBy: [{ is_default: 'desc' }, { bank_name: 'asc' }],
      select: BANK_ACCOUNT_SELECT,
    }),
    prisma.shopStaffCode.findMany({
      where: { shop_id: shopId, is_active: true },
      orderBy: [{ code: 'asc' }],
      select: STAFF_CODE_SELECT,
    }),
  ]);

  return {
    shop,
    gst_configs,
    bank_accounts,
    staff_codes,
  };
};

const pullStocksPage = async (shopId, { cursor, limit, since }) => {
  const where = { shop_id: shopId };
  if (since) where.updated_at = { gte: since };
  if (cursor) where.variant_id = { gt: cursor };

  const rows = await prisma.shopStock.findMany({
    where,
    orderBy: { variant_id: 'asc' },
    take: limit + 1,
    select: SHOP_STOCK_SYNC_SELECT,
  });

  const has_more = rows.length > limit;
  const items = has_more ? rows.slice(0, limit) : rows;
  const next_cursor = has_more ? items[items.length - 1].variant_id : null;

  return { items, next_cursor, has_more };
};

const pullCustomersPage = async ({ cursor, limit, since }) => {
  const where = { is_active: true };
  if (since) where.updated_at = { gte: since };
  if (cursor) where.customer_id = { gt: cursor };

  const rows = await prisma.customer.findMany({
    where,
    orderBy: { customer_id: 'asc' },
    take: limit + 1,
    select: CUSTOMER_SYNC_SELECT,
  });

  const has_more = rows.length > limit;
  const items = has_more ? rows.slice(0, limit) : rows;
  const next_cursor = has_more ? items[items.length - 1].customer_id : null;

  return { items, next_cursor, has_more };
};

const SyncPullService = {
  /**
   * Download shop-scoped offline snapshot (cursor-paginated for large datasets).
   */
  async pull(query, user) {
    const shopId = await resolveSyncShopId(user, query.shop_id);
    const sections = parseSections(query.sections);
    const limit = parseLimit(query.limit);
    const since = parseSince(query.since);

    const response = {
      sync_version: SYNC_API_VERSION,
      server_time: new Date().toISOString(),
      shop_id: shopId,
      config: null,
      stocks: null,
      customers: null,
    };

    if (sections.includes('config')) {
      response.config = await pullConfig(shopId);
    }

    if (sections.includes('stocks')) {
      response.stocks = await pullStocksPage(shopId, {
        cursor: query.stocks_cursor || null,
        limit,
        since,
      });
    }

    if (sections.includes('customers')) {
      response.customers = await pullCustomersPage({
        cursor: query.customers_cursor || null,
        limit,
        since,
      });
    }

    return response;
  },
};

module.exports = SyncPullService;
