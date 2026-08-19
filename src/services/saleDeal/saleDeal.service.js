const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const logger = require('../../utils/logger.utils');
const ComboRuleService = require('../combo/comboRule.service');
const { roundMoney } = require('../../utils/comboPricing.utils');
const {
  isMissingSaleDealTable,
  isLiveSaleDeal,
  resolveSalePriceBand,
  validateSalePriceAgainstCatalog,
  parseExpiresAt,
  applySaleOverlayToVariant,
} = require('../../utils/saleDeal.utils');

const SALE_DEAL_SELECT = {
  sale_deal_id: true,
  variant_id: true,
  sale_price: true,
  expires_at: true,
  is_active: true,
  created_by_user_id: true,
  created_at: true,
  updated_at: true,
  variant: {
    select: {
      variant_id: true,
      product_code: true,
      sku: true,
      mrp: true,
      special_price: true,
      combo_eligible: true,
      product: {
        select: {
          name: true,
          brand_name: true,
        },
      },
    },
  },
};

const { isOrgLevelAdmin } = require('../../utils/orgRole.utils');

const assertOrgLevelAdmin = (user) => {
  if (!isOrgLevelAdmin(user)) {
    throw new AppError("Only Super Admin or Org Manager can manage today's deals", 403, 'FORBIDDEN');
  }
};

const assertSaleDealModel = () => {
  if (!prisma.saleDeal) {
    throw new AppError(
      "Today's Deal is not set up on this database yet. Restart the API after prisma generate, then run prisma migrate deploy.",
      500,
      'DB_SCHEMA_OUT_OF_DATE'
    );
  }
};

const mapSaleDealError = (err, fallbackMessage, fallbackCode = 'SALE_DEAL_ERROR') => {
  if (err instanceof AppError) throw err;
  if (isMissingSaleDealTable(err)) {
    throw new AppError(
      "Today's Deal is not set up on this database yet. Run prisma migrate deploy, then retry.",
      500,
      'DB_SCHEMA_OUT_OF_DATE'
    );
  }
  logger.error(fallbackMessage, { error: err?.message });
  throw new AppError(fallbackMessage, 500, fallbackCode);
};

const formatDealRow = (deal, comboRules = [], now = new Date()) => {
  const variant = deal?.variant || {};
  const band = resolveSalePriceBand(variant, comboRules);
  const live = isLiveSaleDeal(deal, now);
  return {
    sale_deal_id: deal.sale_deal_id,
    variant_id: deal.variant_id,
    sale_price: roundMoney(Number(deal.sale_price)),
    expires_at: deal.expires_at || null,
    is_active: deal.is_active === true,
    is_live: live,
    created_at: deal.created_at,
    updated_at: deal.updated_at,
    variant_id_code: variant.product_code || '',
    product_code: variant.product_code || '',
    sku: variant.sku || '',
    product_name: variant.product?.name || '',
    brand_name: variant.product?.brand_name || '',
    mrp: variant.mrp != null ? roundMoney(Number(variant.mrp)) : null,
    special_price: variant.special_price != null ? roundMoney(Number(variant.special_price)) : null,
    combo_eligible: variant.combo_eligible === true,
    combo_unit_price: band.combo_unit_price,
    combo_trigger_qty: band.combo_trigger_qty,
    combo_price: band.combo_price,
    min_sale_price: band.min_sale_price,
    max_sale_price: band.max_sale_price,
  };
};

const loadComboRulesSafe = async () => {
  try {
    return await ComboRuleService.listActiveRulesForBilling();
  } catch (err) {
    logger.warn('Combo rules unavailable while validating sale deals', { error: err?.message });
    return [];
  }
};

const SaleDealService = {
  /**
   * Fail-soft overlay map. Missing table / client / query errors return empty so billing and
   * transfers keep using catalog special + combo.
   */
  async loadActiveSaleDealMap(variantIds = []) {
    const ids = [...new Set((Array.isArray(variantIds) ? variantIds : []).filter(Boolean))];
    if (!ids.length) return new Map();
    try {
      if (!prisma.saleDeal) return new Map();
      const now = new Date();
      const rows = await prisma.saleDeal.findMany({
        where: {
          variant_id: { in: ids },
          is_active: true,
          OR: [{ expires_at: null }, { expires_at: { gte: now } }],
        },
        orderBy: { created_at: 'desc' },
        select: {
          sale_deal_id: true,
          variant_id: true,
          sale_price: true,
          expires_at: true,
          is_active: true,
        },
      });
      const map = new Map();
      for (const row of rows) {
        if (!isLiveSaleDeal(row, now)) continue;
        if (!map.has(row.variant_id)) map.set(row.variant_id, row);
      }
      return map;
    } catch (err) {
      if (isMissingSaleDealTable(err)) {
        logger.warn('sale_deals table missing — skipping sale overlay');
        return new Map();
      }
      logger.warn('Failed to load sale deals; using catalog prices', { error: err?.message });
      return new Map();
    }
  },

  async attachLiveSaleDeals(variants = []) {
    const list = Array.isArray(variants) ? variants.filter(Boolean) : [];
    if (!list.length) return list;
    try {
      const map = await this.loadActiveSaleDealMap(list.map((v) => v.variant_id));
      const now = new Date();
      for (const variant of list) {
        applySaleOverlayToVariant(variant, map.get(variant.variant_id), now);
      }
    } catch (err) {
      logger.warn('Sale overlay attach skipped', { error: err?.message });
    }
    return list;
  },

  async attachLiveSaleDealsToShopStocks(stocks = []) {
    const list = Array.isArray(stocks) ? stocks : [];
    const variants = [];
    for (const stock of list) {
      if (stock?.variant) variants.push(stock.variant);
    }
    await this.attachLiveSaleDeals(variants);
    return list;
  },

  async listDeals(query = {}, user) {
    assertOrgLevelAdmin(user);
    assertSaleDealModel();
    try {
      const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
      const where = {};
      if (query.is_active === true || query.is_active === 'true') where.is_active = true;
      if (query.is_active === false || query.is_active === 'false') where.is_active = false;
      const liveOnly = query.live_only === true || query.live_only === 'true';
      const now = new Date();
      if (liveOnly) {
        where.is_active = true;
        where.OR = [{ expires_at: null }, { expires_at: { gte: now } }];
      }

      const [total, deals, comboRules] = await Promise.all([
        prisma.saleDeal.count({ where }),
        prisma.saleDeal.findMany({
          where,
          skip,
          take,
          orderBy: [{ is_active: 'desc' }, { created_at: 'desc' }],
          select: SALE_DEAL_SELECT,
        }),
        loadComboRulesSafe(),
      ]);

      return {
        total,
        page,
        limit,
        deals: deals.map((deal) => formatDealRow(deal, comboRules, now)),
      };
    } catch (err) {
      mapSaleDealError(err, 'Failed to list sale deals', 'SALE_DEAL_LIST_FAILED');
    }
  },

  async searchVariants(query = {}, user) {
    assertOrgLevelAdmin(user);
    assertSaleDealModel();
    try {
      const search = String(query.search || '').trim();
      if (search.length < 1) {
        throw new AppError('search is required', 400, 'SEARCH_REQUIRED');
      }
      if (search.length > 120) {
        throw new AppError('search must be at most 120 characters', 400, 'SEARCH_TOO_LONG');
      }

      const [variants, comboRules] = await Promise.all([
        prisma.productVariant.findMany({
          where: {
            is_active: true,
            product: { is_active: true },
            OR: [
              { product_code: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
              { product: { brand_name: { contains: search, mode: 'insensitive' } } },
            ],
          },
          take: 50,
          orderBy: [{ product_code: 'asc' }, { sort_order: 'asc' }],
          select: {
            variant_id: true,
            product_id: true,
            product_code: true,
            sku: true,
            mrp: true,
            special_price: true,
            combo_eligible: true,
            product: {
              select: {
                name: true,
                brand_name: true,
              },
            },
          },
        }),
        loadComboRulesSafe(),
      ]);

      const dealMap = await this.loadActiveSaleDealMap(variants.map((v) => v.variant_id));
      const now = new Date();

      return {
        search,
        total: variants.length,
        variants: variants.map((variant) => {
          const deal = dealMap.get(variant.variant_id) || null;
          applySaleOverlayToVariant(variant, deal, now);
          const band = resolveSalePriceBand(variant, comboRules);
          return {
            variant_id: variant.variant_id,
            product_id: variant.product_id,
            product_code: variant.product_code,
            sku: variant.sku,
            product_name: variant.product?.name || '',
            brand_name: variant.product?.brand_name || '',
            mrp: roundMoney(Number(variant.mrp) || 0),
            special_price: roundMoney(Number(variant.special_price) || 0),
            combo_eligible: variant.combo_eligible === true,
            combo_unit_price: band.combo_unit_price,
            combo_trigger_qty: band.combo_trigger_qty,
            combo_price: band.combo_price,
            min_sale_price: band.min_sale_price,
            max_sale_price: band.max_sale_price,
            on_sale: variant.on_sale === true,
            sale_deal_id: variant.sale_deal_id,
            sale_price: variant.sale_price,
            sale_expires_at: variant.sale_expires_at,
          };
        }),
      };
    } catch (err) {
      mapSaleDealError(err, 'Failed to search variants for sale deals', 'SALE_DEAL_SEARCH_FAILED');
    }
  },

  async getDealById(saleDealId, user) {
    assertOrgLevelAdmin(user);
    assertSaleDealModel();
    try {
      const deal = await prisma.saleDeal.findUnique({
        where: { sale_deal_id: saleDealId },
        select: SALE_DEAL_SELECT,
      });
      if (!deal) throw new AppError('Sale deal not found', 404, 'SALE_DEAL_NOT_FOUND');
      const comboRules = await loadComboRulesSafe();
      return formatDealRow(deal, comboRules);
    } catch (err) {
      mapSaleDealError(err, 'Failed to load sale deal', 'SALE_DEAL_GET_FAILED');
    }
  },

  async createDeal(data = {}, user) {
    assertOrgLevelAdmin(user);
    assertSaleDealModel();
    try {
      const variantId = String(data.variant_id || '').trim();
      if (!variantId) throw new AppError('variant_id is required', 400, 'VARIANT_ID_REQUIRED');

      const variant = await prisma.productVariant.findUnique({
        where: { variant_id: variantId },
        select: {
          variant_id: true,
          is_active: true,
          mrp: true,
          special_price: true,
          combo_eligible: true,
          product: { select: { is_active: true } },
        },
      });
      if (!variant || !variant.is_active || variant.product?.is_active === false) {
        throw new AppError('Variant not found or inactive', 404, 'VARIANT_NOT_FOUND');
      }

      const comboRules = await loadComboRulesSafe();
      const salePrice = validateSalePriceAgainstCatalog(variant, data.sale_price, comboRules);
      const expiresAt = parseExpiresAt(data.expires_at);
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw new AppError('expires_at must be in the future, or leave it empty for until Sale Off', 400, 'EXPIRES_AT_IN_PAST');
      }

      const created = await prisma.$transaction(async (tx) => {
        await tx.saleDeal.updateMany({
          where: { variant_id: variantId, is_active: true },
          data: { is_active: false },
        });
        return tx.saleDeal.create({
          data: {
            variant_id: variantId,
            sale_price: salePrice,
            expires_at: expiresAt,
            is_active: true,
            created_by_user_id: user?.userId || user?.user_id || null,
          },
          select: SALE_DEAL_SELECT,
        });
      });

      return formatDealRow(created, comboRules);
    } catch (err) {
      mapSaleDealError(err, 'Failed to create sale deal', 'SALE_DEAL_CREATE_FAILED');
    }
  },

  async updateDeal(saleDealId, data = {}, user) {
    assertOrgLevelAdmin(user);
    assertSaleDealModel();
    try {
      const existing = await prisma.saleDeal.findUnique({
        where: { sale_deal_id: saleDealId },
        select: SALE_DEAL_SELECT,
      });
      if (!existing) throw new AppError('Sale deal not found', 404, 'SALE_DEAL_NOT_FOUND');

      const comboRules = await loadComboRulesSafe();
      const payload = {};

      if (Object.prototype.hasOwnProperty.call(data, 'sale_price')) {
        payload.sale_price = validateSalePriceAgainstCatalog(existing.variant, data.sale_price, comboRules);
      }
      if (Object.prototype.hasOwnProperty.call(data, 'expires_at')) {
        const expiresAt = parseExpiresAt(data.expires_at);
        if (expiresAt && expiresAt.getTime() <= Date.now()) {
          throw new AppError('expires_at must be in the future, or leave it empty for until Sale Off', 400, 'EXPIRES_AT_IN_PAST');
        }
        payload.expires_at = expiresAt;
      }

      if (!Object.keys(payload).length) {
        throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
      }

      const updated = await prisma.saleDeal.update({
        where: { sale_deal_id: saleDealId },
        data: payload,
        select: SALE_DEAL_SELECT,
      });
      return formatDealRow(updated, comboRules);
    } catch (err) {
      mapSaleDealError(err, 'Failed to update sale deal', 'SALE_DEAL_UPDATE_FAILED');
    }
  },

  async setActive(saleDealId, isActive, user) {
    assertOrgLevelAdmin(user);
    assertSaleDealModel();
    try {
      const existing = await prisma.saleDeal.findUnique({
        where: { sale_deal_id: saleDealId },
        select: { sale_deal_id: true, variant_id: true, is_active: true },
      });
      if (!existing) throw new AppError('Sale deal not found', 404, 'SALE_DEAL_NOT_FOUND');

      const nextActive = isActive === true || isActive === 'true' || isActive === 1;
      const comboRules = await loadComboRulesSafe();

      const updated = await prisma.$transaction(async (tx) => {
        if (nextActive) {
          await tx.saleDeal.updateMany({
            where: {
              variant_id: existing.variant_id,
              is_active: true,
              sale_deal_id: { not: saleDealId },
            },
            data: { is_active: false },
          });
        }
        return tx.saleDeal.update({
          where: { sale_deal_id: saleDealId },
          data: { is_active: nextActive },
          select: SALE_DEAL_SELECT,
        });
      });

      return formatDealRow(updated, comboRules);
    } catch (err) {
      mapSaleDealError(err, 'Failed to update sale deal status', 'SALE_DEAL_STATUS_FAILED');
    }
  },
};

module.exports = SaleDealService;
