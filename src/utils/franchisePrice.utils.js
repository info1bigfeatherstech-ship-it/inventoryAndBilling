/**
 * Franchise transfer pricing — calculated at runtime from variant cost + org markup %.
 * f.price is never stored on Product / ProductVariant master records.
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

/**
 * Franchise unit price per variant: base + markup% of base.
 * @param {object} variant
 * @param {number} markupPercent
 */
const calculateFranchiseUnitPrice = (variant, markupPercent) => {
  const base = resolveVariantBaseCost(variant);
  const pct = resolveFranchiseMarkupPercent(markupPercent);
  return roundMoney(base * (1 + pct / 100));
};

/**
 * Snapshot franchise pricing on a transfer line at dispatch.
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
  calculateFranchiseUnitPrice,
  snapshotFranchiseTransferPricing,
  isWarehouseInternalRole,
  isFranchiseShopType,
};
