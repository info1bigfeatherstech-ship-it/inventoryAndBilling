/**
 * Franchise transfer pricing — calculated at runtime; never stored on Product / ProductVariant masters.
 *
 * F.Price = totalCost + max(0, specialPrice - totalCost) × markup%
 * where totalCost = purchase_price + expenses
 * markup% is org setting: 20 | 40 | 60
 */
const { roundMoney } = require('./billing.utils');

const ALLOWED_FRANCHISE_MARKUP_PERCENTS = [20, 40, 60];
const DEFAULT_FRANCHISE_MARKUP_PERCENT = 40;

const resolveFranchiseMarkupPercent = (value) => {
  const n = Number(value);
  if (ALLOWED_FRANCHISE_MARKUP_PERCENTS.includes(n)) return n;
  return DEFAULT_FRANCHISE_MARKUP_PERCENT;
};

/** Variant landed base = purchase_price + expenses (variant-level expenses). */
const resolveVariantBaseCost = (variant) => {
  if (!variant) return 0;
  const purchase = Number(variant.purchase_price);
  const expenses =
    variant.expenses != null && variant.expenses !== ''
      ? Number(variant.expenses)
      : Number(variant.product?.expenses) || 0;
  const unit =
    (Number.isFinite(purchase) ? purchase : 0) + (Number.isFinite(expenses) ? expenses : 0);
  return roundMoney(Math.max(0, unit));
};

const resolveVariantSpecialPrice = (variant) => {
  if (!variant) return 0;
  const special = Number(variant.special_price);
  return roundMoney(Math.max(0, Number.isFinite(special) ? special : 0));
};

/**
 * Franchise unit price per variant.
 * Markup % applies to (special − totalCost), then added to totalCost.
 * If special ≤ totalCost, gap is treated as 0 (no error) → F.Price = totalCost.
 *
 * @param {object} variant
 * @param {number} markupPercent
 */
const calculateFranchiseUnitPrice = (variant, markupPercent) => {
  const totalCost = resolveVariantBaseCost(variant);
  const special = resolveVariantSpecialPrice(variant);
  const pct = resolveFranchiseMarkupPercent(markupPercent);
  const gap = Math.max(0, special - totalCost);
  const markupAmount = roundMoney(gap * (pct / 100));
  return roundMoney(totalCost + markupAmount);
};

/**
 * Snapshot franchise pricing on a transfer line at approve / dispatch.
 */
const snapshotFranchiseTransferPricing = (variant, quantity, markupPercent) => {
  const qty = Number(quantity);
  const unit = calculateFranchiseUnitPrice(variant, markupPercent);
  const mrp = roundMoney(Number(variant?.mrp) || 0);
  const safeQty = Number.isInteger(qty) && qty > 0 ? qty : 0;
  return {
    franchise_markup_percent_snapshot: resolveFranchiseMarkupPercent(markupPercent),
    franchise_mrp_snapshot: mrp,
    franchise_unit_price_snapshot: unit,
    franchise_line_value_snapshot: roundMoney(unit * safeQty),
  };
};

const WAREHOUSE_INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER']);

const isWarehouseInternalRole = (role) => WAREHOUSE_INTERNAL_ROLES.has(role);

const isFranchiseShopType = (shopType) => shopType === 'FRANCHISE';

module.exports = {
  ALLOWED_FRANCHISE_MARKUP_PERCENTS,
  DEFAULT_FRANCHISE_MARKUP_PERCENT,
  resolveFranchiseMarkupPercent,
  resolveVariantBaseCost,
  resolveVariantSpecialPrice,
  calculateFranchiseUnitPrice,
  snapshotFranchiseTransferPricing,
  isWarehouseInternalRole,
  isFranchiseShopType,
};
