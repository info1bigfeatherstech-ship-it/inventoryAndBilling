const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { resolveShopIdForUser, assertShopReadAccess } = require('../../utils/shopAccess.utils');
const { calculateReorderQuantity } = require('../../utils/stock.utils');
const { parsePagination } = require('../../utils/pagination.utils');
const logger = require('../../utils/logger.utils');
const AppSettingsService = require('../settings/appSettings.service');
const ComboRuleService = require('../combo/comboRule.service');
const {
  calculateFranchiseUnitPrice,
  isFranchiseShopType,
  isWarehouseInternalRole,
} = require('../../utils/franchisePrice.utils');
const { roundMoney } = require('../../utils/billing.utils');

const CATALOG_MODES = ['new', 'existing', 'all'];
const MAX_PRODUCTS_CATALOG_ROWS = 2500;

const priceKey = (price) => roundMoney(price).toFixed(2);

const isShopEffectivelyEmpty = (shopRow) => {
  if (!shopRow) return true;
  const available = Number(shopRow.quantity_available ?? 0);
  const inTransit = Number(shopRow.quantity_in_transit ?? 0);
  return available + inTransit <= 0;
};

const variantMatchesMode = (mode, ctx) => {
  const { warehouseAvailable, shopRow, level, belowMin } = ctx;

  if (warehouseAvailable <= 0) return false;

  switch (mode) {
    case 'new':
      return isShopEffectivelyEmpty(shopRow);
    case 'existing':
      return !!level || (shopRow && !isShopEffectivelyEmpty(shopRow)) || belowMin;
    case 'all':
      return true;
    default:
      return false;
  }
};

const resolveWarehouseAndShop = async (resolvedShopId, warehouseId) => {
  const warehouse = await prisma.warehouse.findUnique({
    where: { warehouse_id: warehouseId },
    select: {
      warehouse_id: true,
      warehouse_name: true,
      warehouse_code: true,
      city: true,
      is_active: true,
    },
  });
  if (!warehouse) throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  if (!warehouse.is_active) throw new AppError('Warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');

  const shop = await prisma.shop.findUnique({
    where: { shop_id: resolvedShopId },
    select: { shop_id: true, shop_name: true, shop_code: true, shop_type: true },
  });
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');

  return { warehouse, shop };
};

/**
 * Flat rows for shop warehouse products catalog / PDF.
 * Includes zero-stock variants. Sorted by product_code ASC.
 */
const buildWarehouseProductsRows = async ({
  resolvedShopId,
  warehouseId,
  user,
  search = '',
}) => {
  const { warehouse, shop } = await resolveWarehouseAndShop(resolvedShopId, warehouseId);
  const isFranchiseShop = isFranchiseShopType(shop.shop_type);
  const franchiseShopViewer = isFranchiseShop && !isWarehouseInternalRole(user?.role);
  // Own (non-franchise) shop may see purchase; franchise shop viewers never do.
  const showPurchasePrice = !isFranchiseShop;
  const showFranchisePrice = isFranchiseShop;

  const franchiseMarkup = isFranchiseShop
    ? await AppSettingsService.getFranchiseMarkupPercent()
    : null;

  const searchTerm = search ? String(search).trim().toLowerCase() : '';

  const variants = await prisma.productVariant.findMany({
    where: {
      is_active: true,
      product: {
        is_active: true,
        warehouse_id: warehouseId,
      },
    },
    select: {
      variant_id: true,
      product_id: true,
      product_code: true,
      sku: true,
      system_barcode: true,
      mrp: true,
      special_price: true,
      combo_eligible: true,
      purchase_price: true,
      expenses: true,
      warranty: true,
      product: {
        select: {
          product_id: true,
          product_code: true,
          name: true,
          brand_name: true,
          warranty: true,
          expenses: true,
        },
      },
      images: {
        orderBy: { sort_order: 'asc' },
        take: 1,
        select: { url: true },
      },
    },
    orderBy: [{ product_code: 'asc' }],
  });

  if (variants.length > MAX_PRODUCTS_CATALOG_ROWS) {
    throw new AppError(
      `Too many variants (${variants.length}). Max ${MAX_PRODUCTS_CATALOG_ROWS} for catalog PDF.`,
      413,
      'CATALOG_TOO_LARGE'
    );
  }

  const variantIds = variants.map((v) => v.variant_id);
  const [whStockRows, activeComboRules] = await Promise.all([
    variantIds.length
      ? prisma.productStock.groupBy({
          by: ['variant_id'],
          where: { warehouse_id: warehouseId, variant_id: { in: variantIds } },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
    ComboRuleService.listActiveRulesForBilling().catch((err) => {
      logger.warn('Failed to load combo rules for products catalog', { error: err.message });
      return [];
    }),
  ]);

  const whQtyMap = new Map(whStockRows.map((r) => [r.variant_id, r._sum.quantity ?? 0]));
  const ruleByPrice = new Map();
  for (const rule of activeComboRules || []) {
    if (!rule || rule.is_active === false) continue;
    const key = priceKey(rule.special_price_group);
    if (!ruleByPrice.has(key)) ruleByPrice.set(key, rule);
  }

  const rows = [];
  for (const variant of variants) {
    if (searchTerm) {
      const haystack = [
        variant.product.name,
        variant.product.product_code,
        variant.product_code,
        variant.sku,
        variant.product.brand_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchTerm)) continue;
    }

    const warehouseAvailable = Number(whQtyMap.get(variant.variant_id) ?? 0);
    const special = variant.special_price != null ? roundMoney(variant.special_price) : null;
    let combo_trigger_qty = null;
    let combo_price = null;
    let combo_unit_price = null;
    if (variant.combo_eligible === true && special != null) {
      const rule = ruleByPrice.get(priceKey(special));
      if (rule && Number(rule.trigger_qty) >= 2 && Number(rule.combo_price) > 0) {
        combo_trigger_qty = Number(rule.trigger_qty);
        combo_price = roundMoney(rule.combo_price);
        combo_unit_price = roundMoney(combo_price / combo_trigger_qty);
      }
    }

    const row = {
      variant_id: variant.variant_id,
      product_id: variant.product.product_id,
      product_code: variant.product_code || variant.product.product_code || '',
      product_name: variant.product.name || '',
      brand_name: variant.product.brand_name || null,
      warranty: variant.warranty || variant.product.warranty || null,
      sku: variant.sku || null,
      image_url: variant.images?.[0]?.url || null,
      mrp: variant.mrp != null ? roundMoney(variant.mrp) : null,
      special_price: special,
      combo_eligible: variant.combo_eligible === true,
      combo_trigger_qty,
      combo_price,
      combo_unit_price,
      warehouse_available: warehouseAvailable,
      out_of_stock: warehouseAvailable <= 0,
    };

    if (showFranchisePrice) {
      row.franchise_unit_price = calculateFranchiseUnitPrice(variant, franchiseMarkup);
    }
    if (showPurchasePrice) {
      row.purchase_price =
        variant.purchase_price != null ? roundMoney(variant.purchase_price) : null;
    }

    rows.push(row);
  }

  rows.sort((a, b) =>
    String(a.product_code || '').localeCompare(String(b.product_code || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );

  return {
    shop_id: resolvedShopId,
    shop_name: shop.shop_name,
    shop_code: shop.shop_code,
    shop_type: shop.shop_type,
    warehouse_id: warehouse.warehouse_id,
    warehouse_name: warehouse.warehouse_name,
    warehouse_code: warehouse.warehouse_code,
    is_franchise_shop: isFranchiseShop,
    franchise_shop_pricing_view: franchiseShopViewer,
    show_purchase_price: showPurchasePrice,
    show_franchise_price: showFranchisePrice,
    franchise_markup_percent: franchiseMarkup,
    rows,
    meta: {
      total_variants: rows.length,
      generated_at: new Date().toISOString(),
    },
  };
};

const ShopWarehouseCatalogService = {
  /**
   * Products grouped by parent, with per-variant warehouse/shop stock for transfer picking.
   * Unchanged transfer-request behavior (stock > 0 only).
   */
  async getWarehouseStockCatalog(shopId, query, user) {
    const resolvedShopId = resolveShopIdForUser(user, shopId);
    assertShopReadAccess(resolvedShopId, user);

    const warehouseId = String(query.warehouse_id || '').trim();
    if (!warehouseId) {
      throw new AppError('warehouse_id query parameter is required', 400, 'WAREHOUSE_ID_REQUIRED');
    }

    const mode = String(query.mode || 'all').trim().toLowerCase();
    if (!CATALOG_MODES.includes(mode)) {
      throw new AppError(
        `mode must be one of: ${CATALOG_MODES.join(', ')}`,
        400,
        'INVALID_CATALOG_MODE'
      );
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { warehouse_id: warehouseId },
      select: {
        warehouse_id: true,
        warehouse_name: true,
        warehouse_code: true,
        city: true,
        is_active: true,
      },
    });
    if (!warehouse) throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
    if (!warehouse.is_active) throw new AppError('Warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');

    const shop = await prisma.shop.findUnique({
      where: { shop_id: resolvedShopId },
      select: { shop_id: true, shop_type: true },
    });
    if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');

    const isFranchiseShop = isFranchiseShopType(shop.shop_type);
    const franchiseShopViewer = isFranchiseShop && !isWarehouseInternalRole(user?.role);
    const franchiseMarkup = isFranchiseShop
      ? await AppSettingsService.getFranchiseMarkupPercent()
      : null;

    const search = query.search ? String(query.search).trim().toLowerCase() : '';

    const whStockRows = await prisma.productStock.groupBy({
      by: ['variant_id'],
      where: {
        warehouse_id: warehouseId,
        quantity: { gt: 0 },
      },
      _sum: { quantity: true },
    });

    if (!whStockRows.length) {
      return {
        shop_id: resolvedShopId,
        warehouse_id: warehouseId,
        warehouse_name: warehouse.warehouse_name,
        mode,
        products: [],
        meta: { total_products: 0, total_variants: 0 },
      };
    }

    const variantIds = whStockRows.map((r) => r.variant_id);
    const whQtyMap = new Map(whStockRows.map((r) => [r.variant_id, r._sum.quantity ?? 0]));

    const [variants, shopStocks, levels] = await Promise.all([
      prisma.productVariant.findMany({
        where: {
          variant_id: { in: variantIds },
          is_active: true,
          product: { is_active: true, warehouse_id: warehouseId },
        },
        select: {
          variant_id: true,
          product_id: true,
          product_code: true,
          sku: true,
          system_barcode: true,
          mrp: true,
          special_price: true,
          combo_eligible: true,
          purchase_price: true,
          expenses: true,
          product: {
            select: {
              product_id: true,
              product_code: true,
              name: true,
              brand_name: true,
              expenses: true,
            },
          },
        },
        orderBy: [{ product: { name: 'asc' } }, { sort_order: 'asc' }],
      }),
      prisma.shopStock.findMany({
        where: { shop_id: resolvedShopId, variant_id: { in: variantIds } },
        select: {
          variant_id: true,
          quantity_available: true,
          quantity_in_transit: true,
        },
      }),
      prisma.shopProductLevel.findMany({
        where: { shop_id: resolvedShopId, variant_id: { in: variantIds }, is_active: true },
        select: {
          variant_id: true,
          min_level: true,
          max_level: true,
          reorder_qty: true,
        },
      }),
    ]);

    const shopStockMap = new Map(shopStocks.map((s) => [s.variant_id, s]));
    const levelMap = new Map(levels.map((l) => [l.variant_id, l]));

    const productMap = new Map();

    for (const variant of variants) {
      const warehouseAvailable = whQtyMap.get(variant.variant_id) ?? 0;
      const shopRow = shopStockMap.get(variant.variant_id);
      const level = levelMap.get(variant.variant_id);
      const shopAvailable = shopRow?.quantity_available ?? 0;
      const shopInTransit = shopRow?.quantity_in_transit ?? 0;
      const belowMin = level != null && shopAvailable < level.min_level;

      if (
        !variantMatchesMode(mode, {
          warehouseAvailable,
          shopRow,
          level,
          belowMin,
        })
      ) {
        continue;
      }

      if (search) {
        const haystack = [
          variant.product.name,
          variant.product.product_code,
          variant.product_code,
          variant.sku,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) continue;
      }

      let suggestedQuantity = null;
      if (mode === 'existing' && level) {
        suggestedQuantity = calculateReorderQuantity(
          shopAvailable,
          level.min_level,
          level.max_level,
          level.reorder_qty
        );
        if (suggestedQuantity <= 0) suggestedQuantity = null;
      }

      const variantPayload = {
        variant_id: variant.variant_id,
        product_code: variant.product_code,
        sku: variant.sku,
        system_barcode: variant.system_barcode,
        mrp: variant.mrp,
        warehouse_available: warehouseAvailable,
        shop_available: shopAvailable,
        shop_in_transit: shopInTransit,
        min_level: level?.min_level ?? null,
        max_level: level?.max_level ?? null,
        suggested_quantity: suggestedQuantity,
        below_min: belowMin,
        selectable: warehouseAvailable > 0,
      };

      variantPayload.special_price = variant.special_price;
      variantPayload.combo_eligible = variant.combo_eligible === true;

      if (isFranchiseShop) {
        variantPayload.franchise_unit_price = calculateFranchiseUnitPrice(variant, franchiseMarkup);
      }

      if (
        !franchiseShopViewer &&
        isFranchiseShop &&
        isWarehouseInternalRole(user?.role)
      ) {
        variantPayload.purchase_price = variant.purchase_price;
      }

      const productId = variant.product_id;
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          product_id: variant.product.product_id,
          product_code: variant.product.product_code,
          name: variant.product.name,
          brand_name: variant.product.brand_name,
          variants: [],
        });
      }
      productMap.get(productId).variants.push(variantPayload);
    }

    let products = Array.from(productMap.values()).filter((p) => p.variants.length > 0);

    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const totalProducts = products.length;
    const totalVariants = products.reduce((s, p) => s + p.variants.length, 0);
    products = products.slice(skip, skip + take);

    logger.info('Warehouse stock catalog', {
      shop_id: resolvedShopId,
      warehouse_id: warehouseId,
      mode,
      products: products.length,
      variants: products.reduce((s, p) => s + p.variants.length, 0),
      user_id: user.userId,
    });

    return {
      shop_id: resolvedShopId,
      warehouse_id: warehouseId,
      warehouse_name: warehouse.warehouse_name,
      warehouse_code: warehouse.warehouse_code,
      mode,
      is_franchise_shop: isFranchiseShop,
      franchise_shop_pricing_view: franchiseShopViewer,
      franchise_markup_percent: franchiseMarkup,
      products,
      meta: {
        page,
        limit,
        total_products: totalProducts,
        total_variants: totalVariants,
        total_pages: Math.ceil(totalProducts / limit) || 0,
      },
    };
  },

  /**
   * Shop-facing full warehouse products list (includes 0 stock).
   * Additive — does not change transfer picker catalog.
   */
  async getWarehouseProductsCatalog(shopId, query, user) {
    const resolvedShopId = resolveShopIdForUser(user, shopId);
    assertShopReadAccess(resolvedShopId, user);

    const warehouseId = String(query.warehouse_id || '').trim();
    if (!warehouseId) {
      throw new AppError('warehouse_id query parameter is required', 400, 'WAREHOUSE_ID_REQUIRED');
    }

    const catalog = await buildWarehouseProductsRows({
      resolvedShopId,
      warehouseId,
      user,
      search: query.search || '',
    });

    logger.info('Warehouse products catalog', {
      shop_id: resolvedShopId,
      warehouse_id: warehouseId,
      rows: catalog.rows.length,
      user_id: user.userId,
    });

    return catalog;
  },
};

module.exports = ShopWarehouseCatalogService;
module.exports.buildWarehouseProductsRows = buildWarehouseProductsRows;
module.exports.MAX_PRODUCTS_CATALOG_ROWS = MAX_PRODUCTS_CATALOG_ROWS;
