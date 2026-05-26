const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { formatDistanceLabel, prioritizeWarehouses, prioritizeShops } = require('../../utils/stock.utils');
const logger = require('../../utils/logger.utils');

/**
 * Resolve variant by search criteria.
 */
const resolveVariant = async (query) => {
  const { variant_id, product_code, sku, barcode } = query;

  if (variant_id) {
    const variant = await prisma.productVariant.findUnique({
      where: { variant_id },
      include: {
        product: {
          select: {
            product_id: true,
            product_code: true,
            name: true,
            is_active: true,
          },
        },
      },
    });
    if (!variant || !variant.is_active || !variant.product.is_active) {
      throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
    }
    return variant;
  }

  if (product_code) {
    const variant = await prisma.productVariant.findFirst({
      where: {
        OR: [
          { product_code: { equals: String(product_code).trim(), mode: 'insensitive' } },
          { product: { product_code: { equals: String(product_code).trim(), mode: 'insensitive' } } },
        ],
        is_active: true,
        product: { is_active: true },
      },
      include: {
        product: {
          select: { product_id: true, product_code: true, name: true, is_active: true },
        },
      },
    });
    if (!variant) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    return variant;
  }

  if (sku) {
    const variant = await prisma.productVariant.findFirst({
      where: {
        sku: { equals: String(sku).trim(), mode: 'insensitive' },
        is_active: true,
        product: { is_active: true },
      },
      include: {
        product: {
          select: { product_id: true, product_code: true, name: true, is_active: true },
        },
      },
    });
    if (!variant) throw new AppError('Variant not found for SKU', 404, 'VARIANT_NOT_FOUND');
    return variant;
  }

  if (barcode) {
    const code = String(barcode).trim();
    const variant = await prisma.productVariant.findFirst({
      where: {
        OR: [{ system_barcode: code }, { vendor_barcode: code }],
        is_active: true,
        product: { is_active: true },
      },
      include: {
        product: {
          select: { product_id: true, product_code: true, name: true, is_active: true },
        },
      },
    });
    if (!variant) throw new AppError('Variant not found for barcode', 404, 'VARIANT_NOT_FOUND');
    return variant;
  }

  throw new AppError('Provide variant_id, product_code, sku, or barcode', 400, 'SEARCH_PARAM_REQUIRED');
};

const StockSearchService = {
  /**
   * Cross-location stock search for emergency refill.
   * @param {object} query
   * @param {object} user
   */
  async searchStock(query, user) {
    try {
      const variant = await resolveVariant(query);
      const referenceCity = query.city?.trim() || null;
      const nearbyOnly = query.nearby_only === true || query.nearby_only === 'true';

      const warehouseStocks = await prisma.productStock.groupBy({
        by: ['warehouse_id'],
        where: {
          variant_id: variant.variant_id,
          quantity: { gt: 0 },
          warehouse: { is_active: true },
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

      let warehouses = warehouseStocks.map((row) => {
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

      const shopStocks = await prisma.shopStock.findMany({
        where: {
          variant_id: variant.variant_id,
          quantity_available: { gt: 0 },
          shop: { is_active: true },
          ...(user.shopId ? { shop_id: { not: user.shopId } } : {}),
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

      let shops = shopStocks.map((row) => ({
        shop_id: row.shop_id,
        shop_code: row.shop.shop_code,
        shop_name: row.shop.shop_name,
        city: row.shop.city,
        distance: formatDistanceLabel(referenceCity, row.shop.city),
        stock_quantity: row.quantity_available,
        last_updated: row.updated_at,
      }));

      if (nearbyOnly && referenceCity) {
        shops = shops.filter((s) => s.distance === 'same city');
        warehouses = warehouses.filter((w) => w.distance === 'same city');
      }

      shops = prioritizeShops(referenceCity || '', shops);

      logger.info('Cross-stock search', {
        variant_id: variant.variant_id,
        warehouse_hits: warehouses.length,
        shop_hits: shops.length,
        user_id: user.userId,
      });

      return {
        product: {
          product_id: variant.product.product_id,
          product_code: variant.product.product_code,
          name: variant.product.name,
        },
        variant: {
          variant_id: variant.variant_id,
          sku: variant.sku,
          product_code: variant.product_code,
          attributes: variant.attributes,
          system_barcode: variant.system_barcode,
        },
        shops,
        warehouses
      };
    } catch (err) {
      logger.error('searchStock failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },
};

module.exports = StockSearchService;
