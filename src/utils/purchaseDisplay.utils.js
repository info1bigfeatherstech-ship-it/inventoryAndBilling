const { roundMoney } = require('./billing.utils');

const formatVariantLabel = (variant) => {
  if (!variant) return '—';
  return variant.sku || variant.product_code || variant.system_barcode || '—';
};

/**
 * Build purchase detail lines for UI: one row per purchase_item with resolved variant,
 * plus optional rollup by variant_id when multiple inward lines map to same SKU.
 *
 * @param {Array<object>} items - purchase_items with variant + product relations
 * @returns {{ lines: Array<object>, lines_by_variant: Array<object> }}
 */
const buildPurchaseDisplayLines = (items) => {
  const lines = (items || []).map((item) => {
    const variant = item.variant || {};
    const product = item.product || variant.product || {};
    const lineSubtotal = item.line_subtotal ?? roundMoney((item.quantity || 0) * (item.purchase_cost || 0));
    const taxAmount = item.tax_amount ?? 0;
    const lineTotal = roundMoney(lineSubtotal + taxAmount);

    return {
      purchase_item_id: item.purchase_item_id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: product.name,
      product_code: product.product_code,
      variant_sku: formatVariantLabel(variant),
      variant_product_code: variant.product_code,
      variant_barcode: variant.system_barcode,
      variant_attributes: variant.attributes,
      quantity: item.quantity,
      purchase_cost: item.purchase_cost,
      gst_percent: item.gst_percent,
      line_subtotal: lineSubtotal,
      tax_amount: taxAmount,
      line_total: lineTotal,
      batch_number: item.batch_number,
      room_zone: item.room_zone,
      rack_shelf: item.rack_shelf,
      position: item.position,
      remarks: item.remarks,
    };
  });

  const variantMap = new Map();

  for (const line of lines) {
    const key = line.variant_id || line.purchase_item_id;
    if (!variantMap.has(key)) {
      variantMap.set(key, {
        variant_id: line.variant_id,
        product_id: line.product_id,
        product_name: line.product_name,
        product_code: line.product_code,
        variant_sku: line.variant_sku,
        variant_product_code: line.variant_product_code,
        quantity: 0,
        purchase_cost: line.purchase_cost,
        gst_percent: line.gst_percent,
        line_subtotal: 0,
        tax_amount: 0,
        line_total: 0,
        batch_numbers: new Set(),
        line_count: 0,
      });
    }

    const agg = variantMap.get(key);
    agg.quantity += line.quantity;
    agg.line_subtotal = roundMoney(agg.line_subtotal + line.line_subtotal);
    agg.tax_amount = roundMoney(agg.tax_amount + line.tax_amount);
    agg.line_total = roundMoney(agg.line_total + line.line_total);
    if (line.batch_number) agg.batch_numbers.add(line.batch_number);
    agg.line_count += 1;
  }

  const lines_by_variant = Array.from(variantMap.values()).map((agg) => ({
    ...agg,
    batch_numbers: [...agg.batch_numbers],
    batch_display: [...agg.batch_numbers].filter(Boolean).join(', ') || '—',
  }));

  return { lines, lines_by_variant };
};

module.exports = {
  buildPurchaseDisplayLines,
  formatVariantLabel,
};
