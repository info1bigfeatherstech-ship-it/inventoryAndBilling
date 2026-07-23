const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { resolveShopIdForUser, assertShopReadAccess } = require('../../utils/shopAccess.utils');
const { calculateReorderQuantity } = require('../../utils/stock.utils');
const { getWarehouseStockAvailable } = require('../../utils/warehouseStock.utils');
const { parsePagination } = require('../../utils/pagination.utils');
const logger = require('../../utils/logger.utils');
const AppSettingsService = require('../settings/appSettings.service');
const {
  calculateFranchiseUnitPrice,
  isFranchiseShopType,
  isWarehouseInternalRole,
} = require('../../utils/franchisePrice.utils');

const CATALOG_MODES = ['new', 'existing', 'all'];

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

const ShopWarehouseCatalogService = {
  /**
   * Products grouped by parent, with per-variant warehouse/shop stock for transfer picking.
   * @param {string} shopId
   * @param {object} query
   * @param {object} user
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
      select: { warehouse_id: true, warehouse_name: true, warehouse_code: true, city: true, is_active: true },
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
      const belowMin =
        level != null &&
        shopAvailable < level.min_level;

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

      // Special / sale price is visible to franchise shop managers so they can
      // compare F.Price (landed cost) vs max sellable Special Price.
      variantPayload.special_price = variant.special_price;

      if (isFranchiseShop) {
        variantPayload.franchise_unit_price = calculateFranchiseUnitPrice(variant, franchiseMarkup);
      }

      // Purchase price stays warehouse-internal only (never expose to franchise shop viewers).
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
};

module.exports = ShopWarehouseCatalogService;
