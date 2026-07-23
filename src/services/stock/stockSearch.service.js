const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { resolveVariantByScanCode } = require('../../utils/variantScan.utils');
const { formatDistanceLabel, prioritizeWarehouses, prioritizeShops } = require('../../utils/stock.utils');
const { resolveStockSearchScope } = require('../../utils/stockSearchScope.utils');
const logger = require('../../utils/logger.utils');

const VARIANT_PRODUCT_INCLUDE = {
  product: {
    select: {
      product_id: true,
      product_code: true,
      name: true,
      is_active: true,
    },
  },
};

const mapVariantPayload = (variant) => ({
  variant_id: variant.variant_id,
  sku: variant.sku,
  product_code: variant.product_code,
  attributes: variant.attributes,
  system_barcode: variant.system_barcode,
  purchase_code: variant.purchase_code,
  is_default: variant.is_default ?? false,
});

const mapProductPayload = (product) => ({
  product_id: product.product_id,
  product_code: product.product_code,
  name: product.name,
});

/**
 * Resolve one or more variants for stock search.
 * product_code → all matching active variants (product-level OR exact variant code).
 * Other keys → single variant (wrapped as a 1-item list).
 */
const resolveVariants = async (query) => {
  const { variant_id, product_code, sku, barcode, purchase_code } = query;

  if (variant_id) {
    const variant = await prisma.productVariant.findUnique({
      where: { variant_id },
      include: VARIANT_PRODUCT_INCLUDE,
    });
    if (!variant || !variant.is_active || !variant.product.is_active) {
      throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
    }
    return [variant];
  }

  if (product_code) {
    const code = String(product_code).trim();
    if (!code) {
      throw new AppError('product_code is required', 400, 'SEARCH_PARAM_REQUIRED');
    }

    const variants = await prisma.productVariant.findMany({
      where: {
        is_active: true,
        product: { is_active: true },
        OR: [
          { product_code: { equals: code, mode: 'insensitive' } },
          { product: { product_code: { equals: code, mode: 'insensitive' } } },
        ],
      },
      include: VARIANT_PRODUCT_INCLUDE,
      orderBy: [{ is_default: 'desc' }, { product_code: 'asc' }],
    });

    if (!variants.length) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    // Prefer exact variant.product_code matches first when sorting later; keep all siblings.
    return variants;
  }

  if (sku) {
    const variant = await prisma.productVariant.findFirst({
      where: {
        sku: { equals: String(sku).trim(), mode: 'insensitive' },
        is_active: true,
        product: { is_active: true },
      },
      include: VARIANT_PRODUCT_INCLUDE,
    });
    if (!variant) throw new AppError('Variant not found for SKU', 404, 'VARIANT_NOT_FOUND');
    return [variant];
  }

  if (barcode) {
    const variant = await resolveVariantByScanCode(prisma, barcode, {
      include: VARIANT_PRODUCT_INCLUDE,
    });
    if (!variant) throw new AppError('Variant not found for barcode', 404, 'VARIANT_NOT_FOUND');
    return [variant];
  }

  if (purchase_code) {
    const purchaseCodeInt = parseInt(String(purchase_code).trim(), 10);
    if (!Number.isFinite(purchaseCodeInt)) {
      throw new AppError('purchase_code must be a number', 400, 'INVALID_PURCHASE_CODE');
    }
    const variant = await resolveVariantByScanCode(prisma, String(purchaseCodeInt), {
      include: VARIANT_PRODUCT_INCLUDE,
    });
    if (!variant) throw new AppError('Variant not found for purchase code', 404, 'VARIANT_NOT_FOUND');
    return [variant];
  }

  throw new AppError(
    'Provide variant_id, product_code, sku, barcode, or purchase_code',
    400,
    'SEARCH_PARAM_REQUIRED'
  );
};

const loadLocationsForVariant = async (variantId, scope, { referenceCity, nearbyOnly }) => {
  let warehouses = [];
  if (scope.includeWarehouses) {
    const warehouseStocks = await prisma.productStock.groupBy({
      by: ['warehouse_id'],
      where: {
        variant_id: variantId,
        quantity: { gt: 0 },
        warehouse: { is_active: true },
        ...(scope.excludeWarehouseIds.length
          ? { warehouse_id: { notIn: scope.excludeWarehouseIds } }
          : {}),
      },
      _sum: { quantity: true },
      _max: { updated_at: true },
    });

    const warehouseIds = warehouseStocks.map((w) => w.warehouse_id);
    const warehousesMeta = warehouseIds.length
      ? await prisma.warehouse.findMany({
          where: { warehouse_id: { in: warehouseIds } },
          select: {
            warehouse_id: true,
            warehouse_code: true,
            warehouse_name: true,
            city: true,
          },
        })
      : [];

    const whMap = new Map(warehousesMeta.map((w) => [w.warehouse_id, w]));

    warehouses = warehouseStocks.map((row) => {
      const meta = whMap.get(row.warehouse_id);
      return {
        warehouse_id: row.warehouse_id,
        warehouse_code: meta?.warehouse_code,
        warehouse_name: meta?.warehouse_name,
        city: meta?.city,
        distance: formatDistanceLabel(referenceCity, meta?.city),
        stock_quantity: row._sum.quantity ?? 0,
        last_updated: row._max.updated_at,
      };
    });

    warehouses = prioritizeWarehouses(referenceCity || '', warehouses);
  }

  let shops = [];
  if (scope.includeShops) {
    const shopStocks = await prisma.shopStock.findMany({
      where: {
        variant_id: variantId,
        quantity_available: { gt: 0 },
        shop: { is_active: true },
        ...(scope.excludeShopIds.length ? { shop_id: { notIn: scope.excludeShopIds } } : {}),
      },
      include: {
        shop: {
          select: {
            shop_id: true,
            shop_code: true,
            shop_name: true,
            city: true,
          },
        },
      },
    });

    shops = shopStocks.map((row) => ({
      shop_id: row.shop_id,
      shop_code: row.shop.shop_code,
      shop_name: row.shop.shop_name,
      city: row.shop.city,
      distance: formatDistanceLabel(referenceCity, row.shop.city),
      stock_quantity: row.quantity_available,
      last_updated: row.updated_at,
    }));

    shops = prioritizeShops(referenceCity || '', shops);
  }

  if (nearbyOnly && referenceCity) {
    shops = shops.filter((s) => s.distance === 'same city');
    warehouses = warehouses.filter((w) => w.distance === 'same city');
  }

  return { warehouses, shops };
};

const totalStockForResult = (entry) => {
  const whQty = (entry.warehouses || []).reduce((s, w) => s + (Number(w.stock_quantity) || 0), 0);
  const shopQty = (entry.shops || []).reduce((s, sh) => s + (Number(sh.stock_quantity) || 0), 0);
  return whQty + shopQty;
};

const StockSearchService = {
  /**
   * Cross-location stock search for emergency refill / single transfer request.
   * product_code returns all matching variants with per-variant locations.
   */
  async searchStock(query, user) {
    try {
      const variants = await resolveVariants(query);
      const referenceCity = query.city?.trim() || null;
      const nearbyOnly = query.nearby_only === true || query.nearby_only === 'true';
      const scope = await resolveStockSearchScope(user, query);
      const searchCode = query.product_code ? String(query.product_code).trim().toLowerCase() : null;

      const variantResults = [];
      for (const variant of variants) {
        const { warehouses, shops } = await loadLocationsForVariant(variant.variant_id, scope, {
          referenceCity,
          nearbyOnly,
        });
        variantResults.push({
          variant: mapVariantPayload(variant),
          warehouses,
          shops,
        });
      }

      // Exact variant code matches first, then higher total stock, then product_code.
      variantResults.sort((a, b) => {
        if (searchCode) {
          const aExact = String(a.variant.product_code || '').toLowerCase() === searchCode ? 1 : 0;
          const bExact = String(b.variant.product_code || '').toLowerCase() === searchCode ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;
        }
        const stockDiff = totalStockForResult(b) - totalStockForResult(a);
        if (stockDiff !== 0) return stockDiff;
        return String(a.variant.product_code || '').localeCompare(String(b.variant.product_code || ''));
      });

      const product = mapProductPayload(variants[0].product);
      const primary = variantResults[0];

      logger.info('Cross-stock search', {
        product_id: product.product_id,
        variant_count: variantResults.length,
        warehouse_hits: variantResults.reduce((s, v) => s + v.warehouses.length, 0),
        shop_hits: variantResults.reduce((s, v) => s + v.shops.length, 0),
        user_id: user.userId,
        role: user.role,
        search_scope: scope.requestType || 'DEFAULT',
      });

      return {
        product,
        /** @deprecated Prefer `variants[]` — kept for older clients (first / primary variant). */
        variant: primary.variant,
        warehouses: primary.warehouses,
        shops: primary.shops,
        /** All matching variants with their own warehouse/shop stock rows. */
        variants: variantResults,
        search_scope: scope.requestType,
      };
    } catch (err) {
      logger.error('searchStock failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },
};

module.exports = StockSearchService;
