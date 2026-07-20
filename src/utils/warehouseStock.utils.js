const { AppError } = require('../errors/AppError');
const { freeQuantityOnRow, getWarehouseFreeAvailable } = require('./warehouseFreeStock.utils');

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
 * Available (free / unreserved) quantity for dispatch validation.
 * - Explicit batch: that batch row only.
 * - Unspecified batch: sum of free qty across rows (quantity - quantity_reserved).
 */
const getWarehouseStockAvailable = async (tx, variantId, warehouseId, batchNumber) =>
  getWarehouseFreeAvailable(tx, variantId, warehouseId, batchNumber);

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
 * Deduct warehouse stock from free (unreserved) quantity only.
 * - Explicit batch: single-row decrement (strict).
 * - Unspecified batch: FIFO across rows with free quantity > 0.
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

    const available = freeQuantityOnRow(row);
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
    },
    orderBy: [{ expiry_date: 'asc' }, { updated_at: 'asc' }],
  });

  for (const stock of stocks) {
    if (remaining <= 0) break;

    const free = freeQuantityOnRow(stock);
    if (free <= 0) continue;

    const deductQty = Math.min(free, remaining);
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
