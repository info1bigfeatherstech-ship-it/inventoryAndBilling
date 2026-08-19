/**
 * Owner-shop wholesale billing — calculated at runtime; never stored on Product / ProductVariant masters.
 * Same shape as F.Price: totalCost + max(0, sellingPrice − totalCost) × %
 * Rounding is nearest rupee (>= .5 rounds up) for both UI and billing.
 */
const { roundMoney } = require('./billing.utils');
const { resolveVariantBaseCost } = require('./franchisePrice.utils');

const DEFAULT_WHOLESALE_MARKUP_PERCENT = 40;
const MIN_WHOLESALE_MARKUP_PERCENT = 0;
const MAX_WHOLESALE_MARKUP_PERCENT = 1000;

const roundWholesaleRupee = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n + 0.5);
};

const resolveWholesaleMarkupPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_WHOLESALE_MARKUP_PERCENT;
  if (n < MIN_WHOLESALE_MARKUP_PERCENT) return MIN_WHOLESALE_MARKUP_PERCENT;
  if (n > MAX_WHOLESALE_MARKUP_PERCENT) return MAX_WHOLESALE_MARKUP_PERCENT;
  return roundMoney(n);
};

const capSellPriceAtMrp = (price, mrp) => {
  const p = roundWholesaleRupee(price);
  const cap = Number(mrp);
  if (Number.isFinite(cap) && cap > 0 && p > cap) return Math.max(0, Math.floor(cap));
  return p;
};

/**
 * Wholesale unit from an explicit selling reference (sale / combo / catalog special).
 * Ignores variant.wholesale_price.
 */
const calculateWholesaleUnitPriceFromSelling = (variant, markupPercent, sellingPrice) => {
  const totalCost = resolveVariantBaseCost(variant);
  const selling = roundMoney(Math.max(0, Number(sellingPrice) || 0));
  const pct = resolveWholesaleMarkupPercent(markupPercent);
  const gap = Math.max(0, selling - totalCost);
  const markupAmount = roundMoney(gap * (pct / 100));
  return capSellPriceAtMrp(totalCost + markupAmount, variant?.mrp);
};

module.exports = {
  DEFAULT_WHOLESALE_MARKUP_PERCENT,
  MIN_WHOLESALE_MARKUP_PERCENT,
  MAX_WHOLESALE_MARKUP_PERCENT,
  roundWholesaleRupee,
  resolveWholesaleMarkupPercent,
  capSellPriceAtMrp,
  calculateWholesaleUnitPriceFromSelling,
};
