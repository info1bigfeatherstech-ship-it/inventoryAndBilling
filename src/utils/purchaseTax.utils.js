/**
 * Purchase / GRN tax from product master (gst_percent + gst_type).
 * Purchase cost is exclusive of tax (standard B2B).
 */

const { normalizeProductGstType, roundMoney } = require('./billing.utils');

/**
 * @param {{ quantity: number, purchaseCost: number, gstPercent: number, gstType: string }} params
 */
const calculatePurchaseLineTax = ({ quantity, purchaseCost, gstPercent, gstType }) => {
  const qty = Number(quantity);
  const unitCost = Number(purchaseCost);
  if (!Number.isInteger(qty) || qty <= 0) {
    return { line_subtotal: 0, tax_amount: 0, gst_percent: 0, gst_type: 'EXEMPT' };
  }
  if (Number.isNaN(unitCost) || unitCost < 0) {
    return { line_subtotal: 0, tax_amount: 0, gst_percent: 0, gst_type: 'EXEMPT' };
  }

  const lineSubtotal = roundMoney(qty * unitCost);
  const productGstType = normalizeProductGstType(gstType);
  const rate = Number(gstPercent) || 0;

  let taxAmount = 0;
  if (productGstType !== 'EXEMPT' && rate > 0 && lineSubtotal > 0) {
    taxAmount = roundMoney((lineSubtotal * rate) / 100);
  }

  return {
    line_subtotal: lineSubtotal,
    tax_amount: taxAmount,
    gst_percent: rate,
    gst_type: productGstType,
  };
};

/**
 * @param {Array<{ line_subtotal: number, tax_amount: number }>} lines
 */
const aggregatePurchaseTotals = (lines) => {
  const subtotal = roundMoney((lines || []).reduce((sum, l) => sum + (l.line_subtotal || 0), 0));
  const taxAmount = roundMoney((lines || []).reduce((sum, l) => sum + (l.tax_amount || 0), 0));
  const totalAmount = roundMoney(subtotal + taxAmount);
  return { subtotal, tax_amount: taxAmount, total_amount: totalAmount };
};

module.exports = {
  calculatePurchaseLineTax,
  aggregatePurchaseTotals,
};
