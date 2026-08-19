/**
 * Franchise transfer pricing — calculated at runtime; never stored on Product / ProductVariant masters.
 *
 * F.Price = totalCost + max(0, specialPrice - totalCost) × markup%
 * where totalCost = purchase_price + expenses
 * markup% is org setting: 20 | 40 | 60
 * Final F.Price is nearest rupee (half-up) for transfer bills / catalog.
 */
const { roundMoney } = require('./billing.utils');

/** Nearest rupee, half-up (31.2 → 31, 31.5 → 32). Transfer F.Price only. */
const roundFranchiseRupee = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
};

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
 * Franchise unit price from an explicit selling reference (special or combo unit).
 * F.Price = totalCost + max(0, sellingPrice − totalCost) × markup%
 * If selling ≤ totalCost, gap is 0 → F.Price = totalCost.
 */
const calculateFranchiseUnitPriceFromSelling = (variant, markupPercent, sellingPrice) => {
  const totalCost = resolveVariantBaseCost(variant);
  const selling = roundMoney(Math.max(0, Number(sellingPrice) || 0));
  const pct = resolveFranchiseMarkupPercent(markupPercent);
  const gap = Math.max(0, selling - totalCost);
  const markupAmount = roundMoney(gap * (pct / 100));
  return roundFranchiseRupee(totalCost + markupAmount);
};

/**
 * Franchise unit price per variant using special price as the selling reference.
 */
const calculateFranchiseUnitPrice = (variant, markupPercent) =>
  calculateFranchiseUnitPriceFromSelling(
    variant,
    markupPercent,
    resolveVariantSpecialPrice(variant)
  );

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

const WAREHOUSE_INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'ORG_MANAGER', 'WH_MANAGER', 'WH_STOCK_LISTER']);

const isWarehouseInternalRole = (role) => WAREHOUSE_INTERNAL_ROLES.has(role);

const isFranchiseShopType = (shopType) => shopType === 'FRANCHISE';

module.exports = {
  ALLOWED_FRANCHISE_MARKUP_PERCENTS,
  DEFAULT_FRANCHISE_MARKUP_PERCENT,
  resolveFranchiseMarkupPercent,
  roundFranchiseRupee,
  resolveVariantBaseCost,
  resolveVariantSpecialPrice,
  calculateFranchiseUnitPriceFromSelling,
  calculateFranchiseUnitPrice,
  snapshotFranchiseTransferPricing,
  isWarehouseInternalRole,
  isFranchiseShopType,
};
