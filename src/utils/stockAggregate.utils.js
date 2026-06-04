const { roundMoney } = require('./billing.utils');

/**
 * Pick the stock row that represents the most recent inward (for last vendor/date on aggregate).
 */
const pickLatestInwardRow = (rows) => {
  if (!rows?.length) return null;
  return rows.reduce((best, row) => {
    if (!best) return row;
    const bestTime = best.last_purchase_date ? new Date(best.last_purchase_date).getTime() : 0;
    const rowTime = row.last_purchase_date ? new Date(row.last_purchase_date).getTime() : 0;
    if (rowTime > bestTime) return row;
    if (rowTime === bestTime && (row.updated_at > best.updated_at)) return row;
    return best;
  }, null);
};

/**
 * Aggregate raw product_stocks rows into one snapshot per variant per warehouse.
 * Batch/location rows are preserved in batch_records for expand UI; qty is summed.
 *
 * @param {Array<object>} stockRows - rows with STOCK_SELECT shape
 * @returns {Array<object>}
 */
const aggregateStocksByVariant = (stockRows) => {
  const map = new Map();

  for (const row of stockRows || []) {
    const variantId = row.variant_id;
    const warehouseId = row.warehouse_id;
    if (!variantId || !warehouseId) continue;

    const key = `${warehouseId}:${variantId}`;
    if (!map.has(key)) {
      map.set(key, {
        aggregate_key: key,
        variant_id: variantId,
        warehouse_id: warehouseId,
        product_id: row.product_id,
        quantity: 0,
        batch_count: 0,
        batch_records: [],
        variant: row.variant,
        warehouse: row.warehouse,
      });
    }

    const agg = map.get(key);
    agg.quantity += Number(row.quantity) || 0;
    agg.batch_records.push(row);
    agg.batch_count = agg.batch_records.length;
  }

  const result = [];

  for (const agg of map.values()) {
    const latestRow = pickLatestInwardRow(agg.batch_records);
    const threshold =
      agg.variant?.low_stock_threshold ??
      agg.batch_records.find((r) => r.low_stock_threshold != null)?.low_stock_threshold ??
      10;

    const primaryStockId = latestRow?.stock_id ?? agg.batch_records[0]?.stock_id;

    result.push({
      ...agg,
      quantity: agg.quantity,
      low_stock_threshold: threshold,
      last_purchase_date: latestRow?.last_purchase_date ?? null,
      last_purchase_id: latestRow?.last_purchase_id ?? null,
      last_purchase: latestRow?.last_purchase ?? null,
      last_vendor_name: latestRow?.last_purchase?.vendor?.company_name ?? null,
      /** Same as primary batch row — keeps list/edit/delete APIs compatible with batch view. */
      stock_id: primaryStockId,
      primary_stock_id: primaryStockId,
      room_zone: latestRow?.room_zone ?? agg.batch_records[0]?.room_zone,
      rack_shelf: latestRow?.rack_shelf ?? agg.batch_records[0]?.rack_shelf,
    });
  }

  result.sort((a, b) => {
    const nameA = a.variant?.product?.name || '';
    const nameB = b.variant?.product?.name || '';
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    const skuA = a.variant?.sku || '';
    const skuB = b.variant?.sku || '';
    return skuA.localeCompare(skuB);
  });

  return result;
};

module.exports = {
  aggregateStocksByVariant,
  pickLatestInwardRow,
};
