const { AppError } = require('../errors/AppError');

/**
 * Normalize batch for storage and lookups. Empty string = no specific batch on request.
 */
const normalizeBatch = (value) => (value != null ? String(value).trim() : '');

/**
 * True when caller specified a concrete batch (not aggregate / FIFO mode).
 */
const isBatchSpecified = (batchNumber) => normalizeBatch(batchNumber) !== '';

const warehouseStockBaseWhere = (variantId, warehouseId) => ({
  variant_id: variantId,
  warehouse_id: warehouseId,
});

/**
 * Available quantity for dispatch validation.
 * - Explicit batch: that batch row only.
 * - Unspecified batch: sum of all rows with quantity > 0 (matches stock-search aggregate).
 */
const getWarehouseStockAvailable = async (tx, variantId, warehouseId, batchNumber) => {
  const batch = normalizeBatch(batchNumber);

  if (isBatchSpecified(batch)) {
    const row = await tx.productStock.findUnique({
      where: {
        variant_id_warehouse_id_batch_number: {
          variant_id: variantId,
          warehouse_id: warehouseId,
          batch_number: batch,
        },
      },
      select: { quantity: true },
    });
    return row?.quantity ?? 0;
  }

  const result = await tx.productStock.aggregate({
    where: {
      ...warehouseStockBaseWhere(variantId, warehouseId),
      quantity: { gt: 0 },
    },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
};

/**
 * @throws {AppError} INSUFFICIENT_STOCK
 */
const assertWarehouseStockAvailable = async (tx, variantId, warehouseId, quantity, batchNumber) => {
  const batch = normalizeBatch(batchNumber);
  const available = await getWarehouseStockAvailable(tx, variantId, warehouseId, batch);

  if (available < quantity) {
    const batchInfo = isBatchSpecified(batch) ? ` in batch "${batch}"` : ' in warehouse';
    throw new AppError(
      `Insufficient warehouse stock${batchInfo}. Available: ${available}, requested: ${quantity}`,
      409,
      'INSUFFICIENT_STOCK',
      {
        available,
        requested: quantity,
        warehouse_id: warehouseId,
        variant_id: variantId,
        ...(isBatchSpecified(batch) ? { batch_number: batch } : {}),
      }
    );
  }

  return available;
};

/**
 * Deduct warehouse stock.
 * - Explicit batch: single-row decrement (strict).
 * - Unspecified batch: FIFO across rows with quantity > 0 (expiry, then oldest update).
 */
const deductWarehouseStock = async (tx, variantId, warehouseId, quantity, batchNumber) => {
  const batch = normalizeBatch(batchNumber);
  const qty = Number(quantity);

  if (isBatchSpecified(batch)) {
    const row = await tx.productStock.findUnique({
      where: {
        variant_id_warehouse_id_batch_number: {
          variant_id: variantId,
          warehouse_id: warehouseId,
          batch_number: batch,
        },
      },
    });

    const available = row?.quantity ?? 0;
    if (available < qty) {
      throw new AppError(
        `Insufficient warehouse stock in batch "${batch}". Available: ${available}, requested: ${qty}`,
        409,
        'INSUFFICIENT_STOCK',
        { available, requested: qty, batch_number: batch }
      );
    }

    await tx.productStock.update({
      where: { stock_id: row.stock_id },
      data: { quantity: { decrement: qty } },
    });
    return;
  }

  let remaining = qty;
  const stocks = await tx.productStock.findMany({
    where: {
      ...warehouseStockBaseWhere(variantId, warehouseId),
      quantity: { gt: 0 },
    },
    orderBy: [{ expiry_date: 'asc' }, { updated_at: 'asc' }],
  });

  for (const stock of stocks) {
    if (remaining <= 0) break;

    const deductQty = Math.min(stock.quantity, remaining);
    await tx.productStock.update({
      where: { stock_id: stock.stock_id },
      data: { quantity: { decrement: deductQty } },
    });
    remaining -= deductQty;
  }

  if (remaining > 0) {
    const available = await getWarehouseStockAvailable(tx, variantId, warehouseId, batch);
    throw new AppError(
      `Insufficient warehouse stock. Available: ${available}, requested: ${qty}`,
      409,
      'INSUFFICIENT_STOCK',
      { available, requested: qty }
    );
  }
};

module.exports = {
  normalizeBatch,
  isBatchSpecified,
  getWarehouseStockAvailable,
  assertWarehouseStockAvailable,
  deductWarehouseStock,
};
