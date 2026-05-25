const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const { assertShopReadAccess, resolveShopIdForUser } = require('../../utils/shopAccess.utils');
const { createStockLedgerEntry } = require('../stock/stockLedger.helpers');
const logger = require('../../utils/logger.utils');

const SHOP_STOCK_SELECT = {
  shop_stock_id: true,
  shop_id: true,
  variant_id: true,
  quantity_available: true,
  quantity_reserved: true,
  quantity_in_transit: true,
  low_stock_threshold: true,
  created_at: true,
  updated_at: true,
  variant: {
    select: {
      variant_id: true,
      sku: true,
      product_code: true, 
      system_barcode: true,
      product: { select: { product_id: true, product_code: true, name: true, warehouse_id: true } },
    },
  },
  shop: { select: { shop_id: true, shop_code: true, shop_name: true, is_active: true } },
};

const assertShopActive = async (shopId) => {
  const shop = await prisma.shop.findUnique({
    where: { shop_id: shopId },
    select: { shop_id: true, is_active: true },
  });
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  if (!shop.is_active) throw new AppError('Shop is inactive', 409, 'SHOP_INACTIVE');
  return shop;
};

const assertVariantExists = async (variantId) => {
  const variant = await prisma.productVariant.findUnique({
    where: { variant_id: variantId },
    select: {
      variant_id: true,
      product_id: true,
      is_active: true,
      product: { select: { is_active: true } },
    },
  });

  if (!variant || !variant.is_active || !variant.product.is_active) {
    throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
  }

  return variant;
};

const ShopStockService = {
  async getShopStock(shopId, variantId, user) {
    const resolvedShopId = resolveShopIdForUser(user, shopId);
    assertShopReadAccess(resolvedShopId, user);
    await assertShopActive(resolvedShopId);

    const stock = await prisma.shopStock.findUnique({
      where: { shop_id_variant_id: { shop_id: resolvedShopId, variant_id: variantId } },
      select: SHOP_STOCK_SELECT,
    });

    if (!stock) {
      return {
        shop_id: resolvedShopId,
        variant_id: variantId,
        quantity_available: 0,
        quantity_reserved: 0,
        quantity_in_transit: 0,
        low_stock_threshold: 5,
      };
    }

    return stock;
  },

  async listShopStocks(shopId, query = {}, user) {
    const resolvedShopId = resolveShopIdForUser(user, shopId || query.shop_id);
    assertShopReadAccess(resolvedShopId, user);

    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = { shop_id: resolvedShopId };

    if (query.variant_id) where.variant_id = query.variant_id;

    if (query.min_quantity != null) {
      where.quantity_available = { gte: Number(query.min_quantity) };
    }

    if (query.low_stock_only === true || query.low_stock_only === 'true') {
      where.quantity_available = { lte: prisma.shopStock.fields?.low_stock_threshold };
      // Prisma doesn't support field compare easily — filter in app or raw
    }

    let stocks = await prisma.shopStock.findMany({
      where,
      skip,
      take: query.low_stock_only ? undefined : take,
      orderBy: { updated_at: 'desc' },
      select: SHOP_STOCK_SELECT,
    });

    if (query.low_stock_only === true || query.low_stock_only === 'true') {
      stocks = stocks.filter((s) => s.quantity_available <= s.low_stock_threshold);
      const total = stocks.length;
      stocks = stocks.slice(skip, skip + take);
      return { total, page, limit, stocks };
    }

    const total = await prisma.shopStock.count({ where });
    return { total, page, limit, stocks };
  },

  async updateShopStock(shopId, variantId, data, user) {
    const resolvedShopId = resolveShopIdForUser(user, shopId);
    assertShopReadAccess(resolvedShopId, user);
    await assertShopActive(resolvedShopId);
    const variant = await assertVariantExists(variantId);

    const operation = data.operation || 'set';
    const delta = data.quantity != null ? Number(data.quantity) : null;
    const reason = data.reason || data.remarks || 'Manual shop stock adjustment';

    if (delta === null || Number.isNaN(delta)) {
      throw new AppError('quantity is required', 400, 'INVALID_QUANTITY');
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.shopStock.findUnique({
          where: { shop_id_variant_id: { shop_id: resolvedShopId, variant_id: variantId } },
        });

        const before = existing?.quantity_available ?? 0;
        let after = before;

        if (operation === 'increment') after = before + delta;
        else if (operation === 'decrement') after = before - delta;
        else after = delta;

        if (after < 0) {
          throw new AppError(
            `Shop stock cannot go negative (current: ${before}, requested: ${operation} ${delta})`,
            409,
            'INSUFFICIENT_STOCK',
            { available: before }
          );
        }

        const row = await tx.shopStock.upsert({
          where: { shop_id_variant_id: { shop_id: resolvedShopId, variant_id: variantId } },
          update: {
            quantity_available: after,
            ...(data.low_stock_threshold != null
              ? { low_stock_threshold: Number(data.low_stock_threshold) }
              : {}),
          },
          create: {
            shop_id: resolvedShopId,
            variant_id: variantId,
            quantity_available: after,
            low_stock_threshold: data.low_stock_threshold != null ? Number(data.low_stock_threshold) : 5,
          },
          select: SHOP_STOCK_SELECT,
        });

        const ledgerQty = Math.abs(after - before);
        if (ledgerQty > 0) {
          await createStockLedgerEntry(tx, {
            productId: variant.product_id,
            variantId: variant.variant_id,
            movementType: 'ADJUSTMENT',
            quantity: ledgerQty,
            toShopId: after > before ? resolvedShopId : null,
            fromShopId: after < before ? resolvedShopId : null,
            referenceType: 'SHOP_STOCK_ADJUSTMENT',
            createdBy: user.userId,
            remarks: `${reason} (${before} → ${after})`,
          });
        }

        logger.info('Shop stock updated', {
          shop_id: resolvedShopId,
          variant_id: variantId,
          before,
          after,
          operation,
        });

        return { stock: row, before, after };
      },
      { isolationLevel: 'Serializable' }
    );

    return result;
  },

  async bulkUpdateShopStock(items, shopId, user) {
    if (!Array.isArray(items) || !items.length) {
      throw new AppError('items array is required', 400, 'ITEMS_REQUIRED');
    }

    const results = { updated: 0, failed: [] };

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        await this.updateShopStock(shopId, item.variant_id, item, user);
        results.updated += 1;
      } catch (error) {
        results.failed.push({
          index: i,
          variant_id: item.variant_id,
          message: error.message,
          code: error.code || 'UPDATE_FAILED',
        });
      }
    }

    return results;
  },

  /**
   * Deduct available stock for a sale inside an open transaction.
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {string} shopId
   * @param {string} variantId
   * @param {number} quantity
   */
  async deductStockForSale(tx, shopId, variantId, quantity) {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new AppError('quantity must be a positive integer', 400, 'TRANSFER_QUANTITY_INVALID');
    }

    const row = await tx.shopStock.findUnique({
      where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    });

    const available = row?.quantity_available ?? 0;
    if (available < qty) {
      throw new AppError(
        `Insufficient shop stock. Available: ${available}, requested: ${qty}`,
        409,
        'INSUFFICIENT_STOCK',
        { available, requested: qty, variant_id: variantId, shop_id: shopId }
      );
    }

    if (row) {
      await tx.shopStock.update({
        where: { shop_stock_id: row.shop_stock_id },
        data: { quantity_available: { decrement: qty } },
      });
    } else {
      throw new AppError('Shop stock record not found', 404, 'SHOP_STOCK_NOT_FOUND');
    }

    return { before: available, after: available - qty };
  },

  /**
   * Restore available stock after bill cancellation inside a transaction.
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
   * @param {string} shopId
   * @param {string} variantId
   * @param {number} quantity
   * @param {number} [lowStockThreshold]
   */
  async restoreStockForSale(tx, shopId, variantId, quantity, lowStockThreshold = 5) {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new AppError('quantity must be a positive integer', 400, 'TRANSFER_QUANTITY_INVALID');
    }

    const row = await tx.shopStock.upsert({
      where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
      update: { quantity_available: { increment: qty } },
      create: {
        shop_id: shopId,
        variant_id: variantId,
        quantity_available: qty,
        low_stock_threshold: lowStockThreshold,
      },
    });

    return row;
  },

  async getLowStockAlerts(shopId, user) {
    const resolvedShopId = resolveShopIdForUser(user, shopId);
    assertShopReadAccess(resolvedShopId, user);

    const stocks = await prisma.shopStock.findMany({
      where: { shop_id: resolvedShopId },
      select: SHOP_STOCK_SELECT,
    });

    const alerts = stocks.filter((s) => s.quantity_available <= s.low_stock_threshold);
    return { shop_id: resolvedShopId, count: alerts.length, alerts };
  },
};

module.exports = ShopStockService;
