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

const PRODUCT_GST_TYPES = ['CGST_SGST', 'IGST', 'EXEMPT'];

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const normalizeStateCode = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const raw = String(value).trim();
  if (/^\d{2}$/.test(raw)) return raw;
  const fromGstin = raw.length >= 2 ? raw.slice(0, 2) : null;
  return fromGstin && /^\d{2}$/.test(fromGstin) ? fromGstin : null;
};

const stateCodeFromGstin = (gstin) => {
  const g = String(gstin || '').trim().toUpperCase();
  if (g.length < 2) return null;
  return normalizeStateCode(g.slice(0, 2));
};

/**
 * Place of supply: override → customer state → GSTIN prefix → shop state.
 */
const resolvePlaceOfSupplyStateCode = ({
  customerStateCode,
  customerGstin,
  overrideCode,
  shopStateCode,
}) => {
  const fromOverride = normalizeStateCode(overrideCode);
  if (fromOverride) return fromOverride;

  const fromCustomer = normalizeStateCode(customerStateCode);
  if (fromCustomer) return fromCustomer;

  const fromGstin = stateCodeFromGstin(customerGstin);
  if (fromGstin) return fromGstin;

  return normalizeStateCode(shopStateCode);
};

/**
 * Intra-state → CGST+SGST; inter-state → IGST (exempt products stay exempt).
 */
const resolveSupplyGstType = (productGstType, shopStateCode, placeOfSupplyCode) => {
  if (normalizeProductGstType(productGstType) === 'EXEMPT') return 'EXEMPT';
  const shop = normalizeStateCode(shopStateCode);
  const pos = normalizeStateCode(placeOfSupplyCode);
  if (!shop || !pos) return 'CGST_SGST';
  return shop === pos ? 'CGST_SGST' : 'IGST';
};

const isIntraStateSupply = (shopStateCode, placeOfSupplyCode) => {
  const shop = normalizeStateCode(shopStateCode);
  const pos = normalizeStateCode(placeOfSupplyCode);
  if (!shop || !pos) return true;
  return shop === pos;
};

const normalizeProductGstType = (gstType) => {
  const t = String(gstType || 'CGST_SGST').trim().toUpperCase();
  return PRODUCT_GST_TYPES.includes(t) ? t : 'CGST_SGST';
};

const isCgstSgstProductType = (gstType) => normalizeProductGstType(gstType) === 'CGST_SGST';

/**
 * Split a line's tax amount into CGST/SGST or IGST per product master gst_type.
 */
const splitTaxByProductGstType = (taxAmount, gstType) => {
  const tax = roundMoney(taxAmount);
  const type = normalizeProductGstType(gstType);
  if (tax <= 0 || type === 'EXEMPT') {
    return { cgst: 0, sgst: 0, igst: 0 };
  }
  if (type === 'IGST') {
    return { cgst: 0, sgst: 0, igst: tax };
  }
  const half = roundMoney(tax / 2);
  return { cgst: half, sgst: roundMoney(tax - half), igst: 0 };
};

/**
 * Per-line tax split for invoice display (from product gst_type + gst_percent).
 */
const splitLineTaxDisplay = (taxAmount, gstPercent, gstType) => {
  const tax = roundMoney(taxAmount);
  const rate = Number(gstPercent) || 0;
  const type = normalizeProductGstType(gstType);

  if (type === 'IGST') {
    return { cgst_percent: 0, sgst_percent: 0, igst_percent: rate, cgst: 0, sgst: 0, igst: tax };
  }
  if (type === 'EXEMPT' || tax <= 0) {
    return { cgst_percent: 0, sgst_percent: 0, igst_percent: 0, cgst: 0, sgst: 0, igst: 0 };
  }
  const halfRate = roundMoney(rate / 2);
  const halfTax = roundMoney(tax / 2);
  return {
    cgst_percent: halfRate,
    sgst_percent: roundMoney(rate - halfRate),
    igst_percent: 0,
    cgst: halfTax,
    sgst: roundMoney(tax - halfTax),
    igst: 0,
  };
};

/**
 * Bill-level CGST/SGST/IGST totals from line rows (each line uses product gst_type).
 */
const buildTaxSummaryFromLines = (lines) => {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  for (const line of lines || []) {
    const split = splitTaxByProductGstType(line.tax_amount, line.gst_type);
    cgst = roundMoney(cgst + split.cgst);
    sgst = roundMoney(sgst + split.sgst);
    igst = roundMoney(igst + split.igst);
  }

  let tax_mode = 'EXEMPT';
  if (igst > 0 && cgst === 0 && sgst === 0) tax_mode = 'IGST';
  else if (cgst > 0 || sgst > 0) tax_mode = 'CGST_SGST';

  return {
    tax_mode,
    cgst,
    sgst,
    igst,
    is_intra_state: tax_mode === 'CGST_SGST',
  };
};

/**
 * Calculate line amounts for a bill item (GST from product gst_percent + gst_type).
 */
const calculateLineAmounts = ({
  quantity,
  unitPrice,
  gstPercent,
  gstType,
  billType,
  lineDiscount = 0,
}) => {
  const qty = Number(quantity);
  const price = Number(unitPrice);
  const lineSubtotal = roundMoney(qty * price);
  const discount = roundMoney(Math.min(lineDiscount, lineSubtotal));
  const taxableAmount = roundMoney(lineSubtotal - discount);
  const productGstType = normalizeProductGstType(gstType);
  const isGstInvoice = billType === 'GST_INVOICE';
  const isTaxableBill = isGstInvoice;

  let taxAmount = 0;
  if (
    isTaxableBill &&
    taxableAmount > 0 &&
    productGstType !== 'EXEMPT' &&
    Number(gstPercent) > 0
  ) {
    taxAmount = roundMoney((taxableAmount * Number(gstPercent)) / 100);
  }

  const lineTotal = roundMoney(taxableAmount + taxAmount);
  let tax_mode = 'EXEMPT';
  if (isTaxableBill && taxAmount > 0) {
    tax_mode = productGstType === 'IGST' ? 'IGST' : 'CGST_SGST';
  }

  return {
    line_subtotal: lineSubtotal,
    discount,
    taxable_amount: taxableAmount,
    tax_amount: taxAmount,
    line_total: lineTotal,
    gst_type: productGstType,
    tax_mode,
  };
};

const sumLineAggregates = (lines) => {
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.line_subtotal, 0));
  const lineTaxSum = roundMoney(lines.reduce((sum, l) => sum + l.tax_amount, 0));
  const lineTaxableSum = roundMoney(lines.reduce((sum, l) => sum + l.taxable_amount, 0));
  const grossBeforeExtra = roundMoney(lineTaxableSum + lineTaxSum);
  return { subtotal, lineTaxSum, lineTaxableSum, grossBeforeExtra };
};

/**
 * Loyalty tier % on subtotal; scales GST proportionally (pre-extra-discount).
 */
const applyLoyaltyDiscount = (
  { subtotal, lineTaxSum, lineTaxableSum, grossBeforeExtra },
  loyaltyDiscountPercent = 0
) => {
  const loyaltyPercent = Math.min(100, Math.max(0, Number(loyaltyDiscountPercent) || 0));
  if (loyaltyPercent <= 0) {
    return {
      subtotal,
      taxable_amount: lineTaxableSum,
      gst_amount: lineTaxSum,
      gross_before_extra_discount: grossBeforeExtra,
    };
  }

  const loyaltyDiscount = roundMoney((subtotal * loyaltyPercent) / 100);
  const taxableAmount = roundMoney(Math.max(0, lineTaxableSum - loyaltyDiscount));
  let gstAmount = 0;
  if (lineTaxableSum > 0 && taxableAmount > 0) {
    gstAmount = roundMoney((lineTaxSum * taxableAmount) / lineTaxableSum);
  }

  return {
    subtotal,
    taxable_amount: taxableAmount,
    gst_amount: gstAmount,
    gross_before_extra_discount: roundMoney(taxableAmount + gstAmount),
  };
};

/**
 * Manual counter discount (₹) applied after GST on gross total.
 * bill.discount stores only this amount — not loyalty or credit notes.
 */
const applyExtraDiscountAfterGross = (aggregates, extraDiscountAmount = 0) => {
  const gross = aggregates.gross_before_extra_discount;
  const extra = roundMoney(Math.min(Math.max(0, Number(extraDiscountAmount) || 0), gross));
  const total_amount = roundMoney(Math.max(0, gross - extra));

  return {
    subtotal: aggregates.subtotal,
    discount: extra,
    taxable_amount: aggregates.taxable_amount,
    gst_amount: aggregates.gst_amount,
    total_amount,
  };
};

/**
 * Compute bill totals: loyalty % first, then fixed ₹ extra discount after GST.
 */
const computeBillTotals = (lines, { loyaltyDiscountPercent = 0, extraDiscountAmount = 0 } = {}) => {
  const base = sumLineAggregates(lines);
  const afterLoyalty = applyLoyaltyDiscount(base, loyaltyDiscountPercent);
  return applyExtraDiscountAfterGross(afterLoyalty, extraDiscountAmount);
};

const parseExtraDiscountAmount = (data) =>
  roundMoney(Math.max(0, Number(data?.extra_discount ?? data?.discount) || 0));

/** @deprecated Use computeBillTotals — kept for any legacy callers */
const aggregateBillTotals = (lines, extraDiscountPercent = 0, loyaltyDiscountPercent = 0) =>
  computeBillTotals(lines, {
    loyaltyDiscountPercent,
    extraDiscountAmount: 0,
  });

const calculateLoyaltyTier = (totalSpent) => {
  const spent = Number(totalSpent) || 0;
  for (const row of LOYALTY_THRESHOLDS) {
    if (spent >= row.min) return row.tier;
  }
  return 'BRONZE';
};

const getLoyaltyDiscountPercent = (tier) => LOYALTY_DISCOUNT_PERCENT[tier] ?? 0;

const derivePaymentStatus = (totalAmount, paidAmount, isCancelled = false) => {
  if (isCancelled) return 'CANCELLED';
  const total = roundMoney(totalAmount);
  const paid = roundMoney(paidAmount);
  if (paid <= 0) return 'PENDING';
  if (paid >= total) return 'PAID';
  return 'PARTIALLY_PAID';
};

/** @deprecated Reports only — use buildTaxSummaryFromLines for billing. */
const splitGstComponents = (gstAmount, intraState) => {
  const tax = roundMoney(gstAmount);
  if (!intraState) return { cgst: 0, sgst: 0, igst: tax };
  const half = roundMoney(tax / 2);
  return { cgst: half, sgst: roundMoney(tax - half), igst: 0 };
};

module.exports = {
  LOYALTY_TIERS,
  LOYALTY_DISCOUNT_PERCENT,
  PRODUCT_GST_TYPES,
  roundMoney,
  normalizeStateCode,
  stateCodeFromGstin,
  resolvePlaceOfSupplyStateCode,
  resolveSupplyGstType,
  normalizeProductGstType,
  isCgstSgstProductType,
  splitTaxByProductGstType,
  calculateLoyaltyTier,
  getLoyaltyDiscountPercent,
  splitLineTaxDisplay,
  buildTaxSummaryFromLines,
  calculateLineAmounts,
  computeBillTotals,
  parseExtraDiscountAmount,
  aggregateBillTotals,
  splitGstComponents,
  isIntraStateSupply,
  derivePaymentStatus,
};
