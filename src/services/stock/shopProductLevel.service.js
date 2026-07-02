const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { resolveShopIdForUser, assertShopReadAccess } = require('../../utils/shopAccess.utils');
const { resolveOwnerShopId } = require('../../utils/transferRequest.utils');
const { calculateReorderQuantity, prioritizeWarehouses } = require('../../utils/stock.utils');
const logger = require('../../utils/logger.utils');

const LEVEL_SELECT = {
  level_id: true,
  shop_id: true,
  variant_id: true,
  min_level: true,
  max_level: true,
  reorder_qty: true,
  is_active: true,
  created_at: true,
  updated_at: true,
  variant: {
    select: {
      variant_id: true,
      sku: true,
      product_code: true,
      product: { select: { product_id: true, name: true, product_code: true } },
    },
  },
};

const ShopProductLevelService = {
  /**
   * Upsert min-max levels for multiple variants at a shop.
   */
  async setProductLevels(data, user) {
    try {
      const shopId = resolveShopIdForUser(user, data.shop_id);
      assertShopReadAccess(shopId, user);

      if (!['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER'].includes(user.role)) {
        throw new AppError('Only shop owners or managers can configure product levels', 403, 'FORBIDDEN');
      }

      if (!Array.isArray(data.items) || !data.items.length) {
        throw new AppError('items array is required', 400, 'ITEMS_REQUIRED');
      }

      const results = { created: 0, updated: 0, failed: [] };

      for (let i = 0; i < data.items.length; i += 1) {
        const item = data.items[i];
        try {
          const minLevel = Number(item.min_level);
          const maxLevel = Number(item.max_level);
          if (!Number.isInteger(minLevel) || minLevel < 0) {
            throw new AppError('min_level must be a non-negative integer', 400, 'INVALID_MIN_LEVEL');
          }
          if (!Number.isInteger(maxLevel) || maxLevel < minLevel) {
            throw new AppError('max_level must be >= min_level', 400, 'INVALID_MAX_LEVEL');
          }

          const variant = await prisma.productVariant.findUnique({
            where: { variant_id: item.variant_id },
            select: { variant_id: true, is_active: true },
          });
          if (!variant?.is_active) throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');

          const existing = await prisma.shopProductLevel.findUnique({
            where: { shop_id_variant_id: { shop_id: shopId, variant_id: item.variant_id } },
          });

          const payload = {
            min_level: minLevel,
            max_level: maxLevel,
            reorder_qty: item.reorder_qty != null ? Number(item.reorder_qty) : null,
            is_active: true,
          };

          if (existing) {
            await prisma.shopProductLevel.update({
              where: { level_id: existing.level_id },
              data: payload,
            });
            results.updated += 1;
          } else {
            await prisma.shopProductLevel.create({
              data: {
                shop_id: shopId,
                variant_id: item.variant_id,
                ...payload,
              },
            });
            results.created += 1;
          }
        } catch (err) {
          results.failed.push({
            index: i,
            variant_id: item.variant_id,
            message: err.message,
            code: err.code || 'LEVEL_UPSERT_FAILED',
          });
        }
      }

      logger.info('Shop product levels saved', { shop_id: shopId, ...results, user_id: user.userId });
      return results;
    } catch (err) {
      logger.error('setProductLevels failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Reorder suggestions for products below minimum at a shop.
   */
  async getReorderSuggestions(query, user) {
    try {
      const shopId = resolveShopIdForUser(user, query.shop_id);
      assertShopReadAccess(shopId, user);

      const shop = await prisma.shop.findUnique({
        where: { shop_id: shopId },
        select: { shop_id: true, shop_name: true, city: true, is_active: true },
      });
      if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');

      const levels = await prisma.shopProductLevel.findMany({
        where: { shop_id: shopId, is_active: true },
        include: {
          variant: {
            select: {
              variant_id: true,
              sku: true,
              product: { select: { product_id: true, name: true } },
            },
          },
        },
      });

      const variantIds = levels.map((l) => l.variant_id);

      const shopStocks = variantIds.length
        ? await prisma.shopStock.findMany({
            where: { shop_id: shopId, variant_id: { in: variantIds } },
            select: { variant_id: true, quantity_available: true },
          })
        : [];
      const stockMap = new Map(shopStocks.map((s) => [s.variant_id, s.quantity_available]));

      const preferredWarehouseId = query.warehouse_id || null;
      const warehouses = await prisma.warehouse.findMany({
        where: { is_active: true },
        select: { warehouse_id: true, warehouse_name: true, city: true },
      });

      const sortedWarehouses = prioritizeWarehouses(shop.city, warehouses).map((w, idx) => ({
        warehouse_id: w.warehouse_id,
        warehouse_name: w.warehouse_name,
        city: w.city,
        is_default:
          preferredWarehouseId != null
            ? w.warehouse_id === preferredWarehouseId
            : idx === 0,
      }));

      const sourceWarehouseId =
        preferredWarehouseId ||
        sortedWarehouses.find((w) => w.is_default)?.warehouse_id ||
        sortedWarehouses[0]?.warehouse_id;

      const whStockMap = new Map();
      if (sourceWarehouseId && variantIds.length) {
        const whStocks = await prisma.productStock.groupBy({
          by: ['variant_id'],
          where: {
            warehouse_id: sourceWarehouseId,
            variant_id: { in: variantIds },
          },
          _sum: { quantity: true },
        });
        for (const row of whStocks) {
          whStockMap.set(row.variant_id, row._sum.quantity ?? 0);
        }
      }

      const items = [];
      let totalSuggested = 0;

      for (const level of levels) {
        const current = stockMap.get(level.variant_id) ?? 0;
        const suggested = calculateReorderQuantity(
          current,
          level.min_level,
          level.max_level,
          level.reorder_qty
        );

        if (suggested <= 0) continue;

        items.push({
          variant_id: level.variant_id,
          product_name: level.variant.product.name,
          sku: level.variant.sku,
          current_stock: current,
          min_level: level.min_level,
          max_level: level.max_level,
          suggested_quantity: suggested,
          available_in_warehouse: whStockMap.get(level.variant_id) ?? 0,
          status: 'BELOW_MIN',
        });
        totalSuggested += suggested;
      }

      return {
        shop_id: shopId,
        shop_name: shop.shop_name,
        source_warehouse_id: sourceWarehouseId,
        warehouses: sortedWarehouses,
        items,
        summary: {
          total_items_below_min: items.length,
          total_suggested_quantity: totalSuggested,
        },
      };
    } catch (err) {
      logger.error('getReorderSuggestions failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },

  async listLevels(shopId, user) {
    const resolved = resolveShopIdForUser(user, shopId);
    assertShopReadAccess(resolved, user);

    const levels = await prisma.shopProductLevel.findMany({
      where: { shop_id: resolved, is_active: true },
      select: LEVEL_SELECT,
      orderBy: { updated_at: 'desc' },
    });

    return levels;
  },
};

module.exports = ShopProductLevelService;
