/**
 * Landed unit cost for internal transfers (valuation / challan).
 * Uses variant purchase_price + expenses at snapshot time.
 */

const { roundMoney } = require('./billing.utils');

/**
 * @param {{ purchase_price?: number, expenses?: number, product?: { expenses?: number } }} variant
 */
const resolveVariantUnitCost = (variant) => {
  if (!variant) return 0;
  const purchase = Number(variant.purchase_price);
  const expenses =
    variant.expenses != null
      ? Number(variant.expenses)
      : Number(variant.product?.expenses) || 0;
  const unit = (Number.isFinite(purchase) ? purchase : 0) + (Number.isFinite(expenses) ? expenses : 0);
  return roundMoney(Math.max(0, unit));
};

/**
 * @param {number} unitCost
 * @param {number} quantity
 */
const computeTransferLineValue = (unitCost, quantity) => {
  const qty = Number(quantity);
  const unit = Number(unitCost);
  if (!Number.isInteger(qty) || qty <= 0 || Number.isNaN(unit) || unit < 0) return { unit_cost: 0, line_value: 0 };
  const unitCostRounded = roundMoney(unit);
  return {
    unit_cost: unitCostRounded,
    line_value: roundMoney(unitCostRounded * qty),
  };
};

/**
 * @param {object} variant
 * @param {number} quantity
 */
const snapshotTransferCost = (variant, quantity) =>
  computeTransferLineValue(resolveVariantUnitCost(variant), quantity);

const VARIANT_COST_SELECT = {
  variant_id: true,
  product_id: true,
  purchase_price: true,
  expenses: true,
  product: { select: { expenses: true, gst_percent: true, gst_type: true, name: true, hsn_code: true } },
};

module.exports = {
  resolveVariantUnitCost,
  computeTransferLineValue,
  snapshotTransferCost,
  VARIANT_COST_SELECT,
};
