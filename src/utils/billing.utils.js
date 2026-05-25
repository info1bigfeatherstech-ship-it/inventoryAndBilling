const { AppError } = require('../errors/AppError');

const LOYALTY_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

const LOYALTY_THRESHOLDS = [
  { tier: 'PLATINUM', min: 200000 },
  { tier: 'GOLD', min: 50000 },
  { tier: 'SILVER', min: 10000 },
  { tier: 'BRONZE', min: 0 },
];

const LOYALTY_DISCOUNT_PERCENT = {
  BRONZE: 0,
  SILVER: 2,
  GOLD: 5,
  PLATINUM: 10,
};

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/**
 * Resolve loyalty tier from lifetime spend.
 * @param {number} totalSpent
 */
const calculateLoyaltyTier = (totalSpent) => {
  const spent = Number(totalSpent) || 0;
  for (const row of LOYALTY_THRESHOLDS) {
    if (spent >= row.min) return row.tier;
  }
  return 'BRONZE';
};

/**
 * Loyalty discount percent for tier.
 * @param {string} tier
 */
const getLoyaltyDiscountPercent = (tier) => LOYALTY_DISCOUNT_PERCENT[tier] ?? 0;

/**
 * Normalize 2-digit Indian state code.
 * @param {string|null|undefined} code
 */
const normalizeStateCode = (code) => {
  if (code == null || code === '') return null;
  const trimmed = String(code).trim();
  if (!/^\d{2}$/.test(trimmed)) {
    throw new AppError('state_code must be a 2-digit numeric code', 400, 'INVALID_STATE_CODE');
  }
  return trimmed;
};

/**
 * True when shop and place of supply are in the same state (CGST+SGST), else IGST.
 * @param {string|null} shopStateCode
 * @param {string|null} placeOfSupplyCode
 */
const isIntraStateSupply = (shopStateCode, placeOfSupplyCode) => {
  const shop = normalizeStateCode(shopStateCode) || process.env.DEFAULT_SHOP_STATE_CODE || null;
  const pos = normalizeStateCode(placeOfSupplyCode) || shop;
  if (!shop || !pos) return true;
  return shop === pos;
};

/**
 * Calculate line amounts for a bill item.
 * @param {object} params
 */
const calculateLineAmounts = ({
  quantity,
  unitPrice,
  gstPercent,
  billType,
  isIntraState,
  lineDiscount = 0,
}) => {
  const qty = Number(quantity);
  const price = Number(unitPrice);
  const lineSubtotal = roundMoney(qty * price);
  const discount = roundMoney(Math.min(lineDiscount, lineSubtotal));
  const taxableAmount = roundMoney(lineSubtotal - discount);

  let taxAmount = 0;
  if (billType === 'GST_INVOICE' && taxableAmount > 0) {
    taxAmount = roundMoney((taxableAmount * Number(gstPercent)) / 100);
  }

  const lineTotal = roundMoney(taxableAmount + taxAmount);

  return {
    line_subtotal: lineSubtotal,
    discount,
    taxable_amount: taxableAmount,
    tax_amount: taxAmount,
    line_total: lineTotal,
    tax_mode: billType === 'NON_GST_INVOICE' ? 'EXEMPT' : isIntraState ? 'CGST_SGST' : 'IGST',
  };
};

/**
 * Apply bill-level discount (loyalty + extra %) and scale tax proportionally.
 * @param {object[]} lines - Computed line rows with tax_amount, line_subtotal, taxable_amount
 * @param {number} extraDiscountPercent - 0-100 from request
 */
const aggregateBillTotals = (lines, extraDiscountPercent = 0, loyaltyDiscountPercent = 0) => {
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.line_subtotal, 0));
  const lineTaxSum = roundMoney(lines.reduce((sum, l) => sum + l.tax_amount, 0));
  const lineTaxableSum = roundMoney(lines.reduce((sum, l) => sum + l.taxable_amount, 0));

  const discountPercent = Math.min(100, Math.max(0, Number(extraDiscountPercent) || 0) + (Number(loyaltyDiscountPercent) || 0));
  const discount = roundMoney((subtotal * discountPercent) / 100);
  const taxableAmount = roundMoney(Math.max(0, lineTaxableSum - discount));

  let gstAmount = 0;
  if (lineTaxableSum > 0 && taxableAmount > 0) {
    gstAmount = roundMoney((lineTaxSum * taxableAmount) / lineTaxableSum);
  } else if (lineTaxableSum === 0) {
    gstAmount = 0;
  }

  const totalAmount = roundMoney(taxableAmount + gstAmount);

  return {
    subtotal,
    discount,
    taxable_amount: taxableAmount,
    gst_amount: gstAmount,
    total_amount: totalAmount,
  };
};

/**
 * Split GST for reports (intra-state → equal CGST/SGST).
 * @param {number} gstAmount
 * @param {boolean} intraState
 */
const splitGstComponents = (gstAmount, intraState) => {
  const tax = roundMoney(gstAmount);
  if (!intraState) {
    return { cgst: 0, sgst: 0, igst: tax };
  }
  const half = roundMoney(tax / 2);
  return { cgst: half, sgst: roundMoney(tax - half), igst: 0 };
};

/**
 * Derive payment status from amounts.
 */
const derivePaymentStatus = (totalAmount, paidAmount, isCancelled = false) => {
  if (isCancelled) return 'CANCELLED';
  const total = roundMoney(totalAmount);
  const paid = roundMoney(paidAmount);
  if (paid <= 0) return 'PENDING';
  if (paid >= total) return 'PAID';
  return 'PARTIALLY_PAID';
};

module.exports = {
  LOYALTY_TIERS,
  LOYALTY_DISCOUNT_PERCENT,
  roundMoney,
  calculateLoyaltyTier,
  getLoyaltyDiscountPercent,
  normalizeStateCode,
  isIntraStateSupply,
  calculateLineAmounts,
  aggregateBillTotals,
  splitGstComponents,
  derivePaymentStatus,
};
