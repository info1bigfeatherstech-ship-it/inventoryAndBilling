/**
 * Normalize batch for storage and lookups. Empty string = no specific batch on request.
 */
const normalizeBatch = (value) => (value != null ? String(value).trim() : '');

const isBatchSpecified = (batchNumber) => normalizeBatch(batchNumber) !== '';

/**
 * Free (unreserved) quantity on a ProductStock row.
 * Never negative even if data is inconsistent.
 */
const freeQuantityOnRow = (row) => {
  const qty = Number(row?.quantity ?? 0);
  const reserved = Number(row?.quantity_reserved ?? 0);
  return Math.max(0, qty - reserved);
};

/**
 * Sum free warehouse stock for a variant (respects online quantity_reserved).
 * - Explicit batch: that batch row only.
 * - Unspecified batch: sum of free qty across all batch rows.
 */
const getWarehouseFreeAvailable = async (tx, variantId, warehouseId, batchNumber) => {
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
      select: { quantity: true, quantity_reserved: true },
    });
    return freeQuantityOnRow(row);
  }

  const rows = await tx.productStock.findMany({
    where: {
      variant_id: variantId,
      warehouse_id: warehouseId,
    },
    select: { quantity: true, quantity_reserved: true },
  });

  return rows.reduce((sum, row) => sum + freeQuantityOnRow(row), 0);
};

module.exports = {
  freeQuantityOnRow,
  getWarehouseFreeAvailable,
};
