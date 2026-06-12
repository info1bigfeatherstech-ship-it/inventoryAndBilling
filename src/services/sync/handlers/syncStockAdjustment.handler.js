const prisma = require('../../../utils/prisma.utils');
const { AppError } = require('../../../errors/AppError');
const ShopStockService = require('../../shop/shopStock.service');

/**
 * Apply an offline shop stock adjustment (increment / decrement / set).
 * Rejects when server stock diverged from the offline snapshot at adjustment time.
 */
const applyOfflineStockAdjustment = async ({ item, user, shopId }) => {
  const payload = item.payload || {};
  const variantId = payload.variant_id;

  if (!variantId) {
    throw new AppError('payload.variant_id is required', 400, 'INVALID_PAYLOAD');
  }

  const operation = payload.operation || 'set';
  const quantity = Number(payload.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new AppError('payload.quantity must be a non-negative number', 400, 'INVALID_QUANTITY');
  }

  const existing = await prisma.shopStock.findUnique({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    select: { quantity_available: true },
  });

  const serverBefore = existing?.quantity_available ?? 0;
  const offlineBefore = payload.offline_before_quantity;

  if (offlineBefore != null && Number(offlineBefore) !== serverBefore) {
    throw new AppError(
      'Server stock changed since this offline adjustment was recorded',
      409,
      'STOCK_SNAPSHOT_MISMATCH',
      {
        variant_id: variantId,
        server_before: serverBefore,
        offline_before: Number(offlineBefore),
        offline_after: payload.offline_after_quantity ?? null,
        product_name: payload.product_name ?? null,
      }
    );
  }

  const result = await ShopStockService.updateShopStock(
    shopId,
    variantId,
    {
      operation,
      quantity,
      reason: payload.reason,
      remarks: payload.remarks,
      low_stock_threshold: payload.low_stock_threshold,
    },
    user
  );

  return {
    server_id: item.client_id,
    data: {
      ...result,
      offline_client_id: item.client_id,
      offline_reference: payload.offline_reference ?? null,
    },
  };
};

module.exports = {
  applyOfflineStockAdjustment,
};
