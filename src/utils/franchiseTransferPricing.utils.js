const AppSettingsService = require('../services/settings/appSettings.service');
const { signBulkTransferBillToken, signSingleTransferBillToken } = require('./transferBillToken.utils');
const {
  calculateFranchiseUnitPrice,
  calculateFranchiseUnitPriceFromSelling,
  snapshotFranchiseTransferPricing,
  roundFranchiseRupee,
  isFranchiseShopType,
  isWarehouseInternalRole,
} = require('./franchisePrice.utils');
const { priceKey } = require('./comboPricing.utils');
const { roundMoney } = require('./billing.utils');
const { isOrgLevelAdmin } = require('./orgRole.utils');

const findTransferComboRule = (variant, rules = []) => {
  if (!variant || variant.combo_eligible !== true) return null;
  const special = roundMoney(Number(variant.special_price) || 0);
  const key = priceKey(special);
  const active = Array.isArray(rules) ? rules : [];
  return (
    active.find((r) => {
      if (!r || r.is_active === false) return false;
      if (Number(r.trigger_qty) < 2 || Number(r.combo_price) <= 0) return false;
      const group = roundMoney(Number(r.special_price_group) || 0);
      return priceKey(group) === key || group === special;
    }) || null
  );
};

/**
 * Same-product combo for franchise transfers (does NOT mix variants).
 * Combo sets use F.Price with gap = (combo_price / trigger_qty) − totalCost.
 * Leftover units keep special-based F.Price.
 * Fail-soft: errors fall back to special-based F.Price.
 */
const snapshotSameProductFranchiseCombo = (variant, quantity, markupPercent, rules = []) => {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const snap = snapshotFranchiseTransferPricing(variant, qty, markupPercent);
  const base = {
    ...snap,
    franchise_combo_applied: false,
    franchise_combo_unit_price: null,
    franchise_combo_units: 0,
    franchise_normal_units: qty,
  };
  if (qty <= 0) return base;

  try {
    const rule = findTransferComboRule(variant, rules);
    if (!rule) return base;

    const triggerQty = Math.floor(Number(rule.trigger_qty));
    const comboPrice = roundMoney(Number(rule.combo_price));
    if (triggerQty < 2 || comboPrice <= 0) return base;

    const sets = Math.floor(qty / triggerQty);
    if (sets <= 0) return base;

    const comboUnits = sets * triggerQty;
    const leftover = qty - comboUnits;
    const specialF = roundFranchiseRupee(Number(snap.franchise_unit_price_snapshot) || 0);
    const comboSelling = roundMoney(comboPrice / triggerQty);
    const comboF = calculateFranchiseUnitPriceFromSelling(variant, markupPercent, comboSelling);
    const lineTotal = roundMoney(comboUnits * comboF + leftover * specialF);

    return {
      ...base,
      franchise_line_value_snapshot: lineTotal,
      franchise_combo_applied: true,
      franchise_combo_unit_price: comboF,
      franchise_combo_units: comboUnits,
      franchise_normal_units: leftover,
    };
  } catch {
    return base;
  }
};

/**
 * Build franchise snapshots for transfer lines.
 * Combo is same-variant only — billing-style mix across products is not used here.
 *
 * @param {Array<{ key: string, quantity: number, variant: object }>} lines
 * @param {number} markupPercent
 * @param {Array} rules
 * @returns {Map<string, object>}
 */
const buildFranchiseSnapshotsWithCombo = (lines, markupPercent, rules = []) => {
  const result = new Map();
  const safeLines = Array.isArray(lines) ? lines : [];

  for (const line of safeLines) {
    const key = String(line.key);
    result.set(
      key,
      snapshotSameProductFranchiseCombo(line.variant, line.quantity, markupPercent, rules)
    );
  }

  return result;
};

const emptyFranchiseComboFields = () => ({
  franchise_combo_applied: false,
  franchise_combo_unit_price: null,
  franchise_combo_units: null,
  franchise_normal_units: null,
});

/**
 * Split a transfer line into charged segments so mixed combo+leftover
 * prints as two rates (e.g. 3 @ ₹35, 2 @ ₹37) — never a blended 35.80.
 * Combo F and special F are nearest-rupee.
 */
const expandFranchiseBillSegments = ({
  quantity,
  franchise_unit_price_snapshot,
  franchise_combo_applied,
  franchise_combo_unit_price,
  franchise_combo_units,
  franchise_normal_units,
} = {}) => {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const specialF = roundFranchiseRupee(Number(franchise_unit_price_snapshot) || 0);
  const comboApplied = franchise_combo_applied === true;
  const comboUnits = comboApplied
    ? Math.max(0, Math.floor(Number(franchise_combo_units) || 0))
    : 0;
  const leftover = comboApplied ? Math.max(0, qty - comboUnits) : qty;
  const comboF =
    comboApplied && franchise_combo_unit_price != null
      ? roundFranchiseRupee(Number(franchise_combo_unit_price))
      : null;

  const segments = [];
  if (comboApplied && comboUnits > 0 && comboF != null) {
    segments.push({
      quantity: comboUnits,
      unit_charged_price: comboF,
      combo_applied: true,
      combo_units: comboUnits,
      normal_units: 0,
      unit_combo_price: comboF,
      line_franchise_total: roundMoney(comboUnits * comboF),
      kind: 'combo',
    });
  }
  if (leftover > 0) {
    segments.push({
      quantity: leftover,
      unit_charged_price: specialF,
      combo_applied: false,
      combo_units: 0,
      normal_units: leftover,
      unit_combo_price: null,
      line_franchise_total: roundMoney(leftover * specialF),
      kind: 'special',
    });
  }
  if (!segments.length && qty > 0) {
    segments.push({
      quantity: qty,
      unit_charged_price: specialF,
      combo_applied: false,
      combo_units: 0,
      normal_units: qty,
      unit_combo_price: null,
      line_franchise_total: roundMoney(qty * specialF),
      kind: 'special',
    });
  }
  return segments;
};

const isFranchiseWhToShopTransfer = (record) =>
  record?.request_type === 'WH_TO_SHOP' && isFranchiseShopType(record?.to_shop?.shop_type);

const viewerIsFranchiseShop = (user, record) => {
  if (!isFranchiseWhToShopTransfer(record)) return false;
  if (isWarehouseInternalRole(user?.role)) return false;
  if (isOrgLevelAdmin(user)) return false;
  const shopId = user?.shopId || user?.shop_id;
  return Boolean(shopId && shopId === record.to_shop_id);
};

const snapshotsFromRecord = (record = {}) => ({
  franchise_markup_percent_snapshot: record.franchise_markup_percent_snapshot,
  franchise_mrp_snapshot: record.franchise_mrp_snapshot,
  franchise_unit_price_snapshot: record.franchise_unit_price_snapshot,
  franchise_line_value_snapshot: record.franchise_line_value_snapshot,
  franchise_combo_applied: record.franchise_combo_applied === true,
  franchise_combo_unit_price: record.franchise_combo_unit_price,
  franchise_combo_units: record.franchise_combo_units,
  franchise_normal_units: record.franchise_normal_units,
});

const resolveFranchiseSnapshots = ({
  record,
  variant,
  quantity,
  markupPercent,
  comboRules = [],
  liveEstimate = false,
}) => {
  const stored = snapshotsFromRecord(record);
  const qty = Number(quantity) || 0;
  if (!liveEstimate && stored.franchise_unit_price_snapshot != null) {
    return stored;
  }
  if (qty > 0 && variant) {
    return snapshotSameProductFranchiseCombo(variant, qty, markupPercent, comboRules);
  }
  return stored;
};

const resolveFranchiseUnitPrice = (snapshots, variant, markupPercent) => {
  if (snapshots?.franchise_unit_price_snapshot != null) {
    return snapshots.franchise_unit_price_snapshot;
  }
  return calculateFranchiseUnitPrice(variant, markupPercent);
};

const resolveFranchiseMrp = (snapshots, variant) => {
  if (snapshots?.franchise_mrp_snapshot != null) return snapshots.franchise_mrp_snapshot;
  return variant?.mrp != null ? roundMoney(Number(variant.mrp)) : null;
};

const resolveSpecialPrice = (variant) => {
  if (variant?.special_price == null || variant.special_price === '') return null;
  const n = Number(variant.special_price);
  return Number.isFinite(n) ? roundMoney(n) : null;
};

const buildFranchisePricingBlock = ({ snapshots, variant, quantity, markupPercent }) => {
  const qty = Number(quantity) || 0;
  const franchiseUnit = roundFranchiseRupee(
    resolveFranchiseUnitPrice(snapshots, variant, markupPercent)
  );
  const mrp = resolveFranchiseMrp(snapshots, variant);
  const specialPrice = resolveSpecialPrice(variant);
  const comboApplied = snapshots?.franchise_combo_applied === true;
  const comboUnit =
    comboApplied && snapshots?.franchise_combo_unit_price != null
      ? roundFranchiseRupee(Number(snapshots.franchise_combo_unit_price))
      : null;
  const comboUnits =
    snapshots?.franchise_combo_units != null ? Number(snapshots.franchise_combo_units) : null;
  const normalUnits =
    snapshots?.franchise_normal_units != null ? Number(snapshots.franchise_normal_units) : null;
  const billSegments = expandFranchiseBillSegments({
    quantity: qty,
    franchise_unit_price_snapshot: franchiseUnit,
    franchise_combo_applied: comboApplied,
    franchise_combo_unit_price: comboUnit,
    franchise_combo_units: comboUnits,
    franchise_normal_units: normalUnits,
  });
  const lineFranchise = roundMoney(
    billSegments.reduce((sum, seg) => sum + (Number(seg.line_franchise_total) || 0), 0)
  );
  const displayUnit =
    billSegments.length === 1 ? billSegments[0].unit_charged_price : null;

  return {
    mrp,
    special_price: specialPrice,
    franchise_unit_price: franchiseUnit,
    blended_unit_price: null,
    display_unit_price: displayUnit,
    franchise_line_value: lineFranchise,
    mrp_line_value: mrp != null ? roundMoney(mrp * qty) : null,
    special_line_value: specialPrice != null ? roundMoney(specialPrice * qty) : null,
    markup_percent: snapshots?.franchise_markup_percent_snapshot ?? markupPercent,
    combo_applied: comboApplied,
    combo_unit_price: comboUnit,
    combo_units: comboUnits,
    normal_units: normalUnits,
    bill_segments: billSegments.map((seg) => ({
      quantity: seg.quantity,
      unit_price: seg.unit_charged_price,
      line_value: seg.line_franchise_total,
      kind: seg.kind,
    })),
  };
};

const stripVariantInternalPricing = (variant) => {
  if (!variant) return variant;
  const { purchase_price, special_price, expenses, product, ...rest } = variant;
  const strippedProduct = product
    ? { ...product, expenses: undefined }
    : undefined;
  return {
    ...rest,
    product: strippedProduct,
  };
};

const enrichVariantForWarehouseFranchiseView = (variant, franchiseUnit) => {
  if (!variant) return variant;
  return {
    ...variant,
    franchise_unit_price: franchiseUnit,
  };
};

const formatSingleTransferRequest = (request, user, markupPercent, comboRules = []) => {
  if (!isFranchiseWhToShopTransfer(request)) return request;

  const franchiseShopView = viewerIsFranchiseShop(user, request);
  const liveEstimate = request.status === 'REQUESTED' || request.franchise_unit_price_snapshot == null;
  const snapshots = resolveFranchiseSnapshots({
    record: request,
    variant: request.variant,
    quantity: request.quantity,
    markupPercent,
    comboRules,
    liveEstimate,
  });

  const franchisePricing = buildFranchisePricingBlock({
    snapshots,
    variant: request.variant,
    quantity: request.quantity,
    markupPercent,
  });

  const formatted = {
    ...request,
    is_franchise_transfer: true,
    pricing_visibility: franchiseShopView ? 'FRANCHISE_SHOP' : 'WAREHOUSE',
    franchise_pricing: franchisePricing,
    ...(request.transfer_bill_number
      ? { public_transfer_bill_token: signSingleTransferBillToken(request.request_id) }
      : {}),
  };

  if (franchiseShopView) {
    delete formatted.unit_cost_snapshot;
    delete formatted.line_value_snapshot;
    formatted.variant = stripVariantInternalPricing(request.variant);
  } else {
    formatted.variant = enrichVariantForWarehouseFranchiseView(
      request.variant,
      franchisePricing.franchise_unit_price
    );
  }

  return formatted;
};

const { getBulkRequestedQuantity } = require('./bulkTransfer.utils');


const resolveItemBillQty = (item, bulk) => {
  if (bulk.transfer_bill_number) {
    if (item.is_approved === false || !(Number(item.approved_quantity) > 0)) return 0;
    return Number(item.approved_quantity);
  }
  if (item.approved_quantity != null) return Number(item.approved_quantity) || 0;
  // Pre-approve: estimate pricing from requested qty only (not sent/approved).
  if (bulk.status === 'REQUESTED') return getBulkRequestedQuantity(item);
  return 0;
};

const formatBulkTransferItem = (item, user, bulk, markupPercent, comboRules = []) => {
  if (!isFranchiseWhToShopTransfer(bulk)) return item;

  const franchiseShopView = viewerIsFranchiseShop(user, bulk);
  const qty = resolveItemBillQty(item, bulk);
  const liveEstimate = bulk.status === 'REQUESTED' && !bulk.transfer_bill_number;
  const snapshots = resolveFranchiseSnapshots({
    record: item,
    variant: item.variant,
    quantity: qty,
    markupPercent,
    comboRules,
    liveEstimate,
  });

  const franchisePricing = buildFranchisePricingBlock({
    snapshots,
    variant: item.variant,
    quantity: qty,
    markupPercent,
  });

  const formatted = {
    ...item,
    franchise_pricing: franchisePricing,
  };

  if (franchiseShopView) {
    delete formatted.unit_cost_snapshot;
    delete formatted.line_value_snapshot;
    formatted.variant = stripVariantInternalPricing(item.variant);
  } else {
    formatted.variant = enrichVariantForWarehouseFranchiseView(
      item.variant,
      franchisePricing.franchise_unit_price
    );
  }

  return formatted;
};

const formatBulkTransferRequest = (bulk, user, markupPercent, comboRules = []) => {
  if (!isFranchiseWhToShopTransfer(bulk)) return bulk;

  const franchiseShopView = viewerIsFranchiseShop(user, bulk);
  const items = (bulk.items || []).map((item) =>
    formatBulkTransferItem(item, user, bulk, markupPercent, comboRules)
  );

  let franchiseBillTotals = null;
  const totalsSource = bulk.transfer_bill_number
    ? items.filter((item) => Number(item.approved_quantity) > 0 && item.is_approved !== false)
    : items;
  if (totalsSource.length) {
    const mrpSubtotal = roundMoney(
      totalsSource.reduce((sum, item) => sum + (item.franchise_pricing?.mrp_line_value || 0), 0)
    );
    const franchiseSubtotal = roundMoney(
      totalsSource.reduce((sum, item) => sum + (item.franchise_pricing?.franchise_line_value || 0), 0)
    );
    const specialSubtotal = roundMoney(
      totalsSource.reduce((sum, item) => sum + (item.franchise_pricing?.special_line_value || 0), 0)
    );
    franchiseBillTotals = {
      mrp_subtotal: mrpSubtotal,
      special_subtotal: specialSubtotal,
      franchise_subtotal: franchiseSubtotal,
      discount: roundMoney(mrpSubtotal - franchiseSubtotal),
      final_amount: franchiseSubtotal,
    };
  }

  return {
    ...bulk,
    is_franchise_transfer: true,
    pricing_visibility: franchiseShopView ? 'FRANCHISE_SHOP' : 'WAREHOUSE',
    items,
    franchise_bill_totals: franchiseBillTotals,
    ...(bulk.transfer_bill_number
      ? {
          public_transfer_bill_token: signBulkTransferBillToken(bulk.bulk_request_id),
        }
      : {}),
  };
};

const loadComboRulesSafe = async () => {
  try {
    const ComboRuleService = require('../services/combo/comboRule.service');
    return await ComboRuleService.listActiveRulesForBilling();
  } catch (err) {
    return [];
  }
};

const formatTransferRequestsForUser = async (requests, user) => {
  if (!Array.isArray(requests) || !requests.length) return requests;
  const needsFranchise = requests.some(isFranchiseWhToShopTransfer);
  const markup = needsFranchise
    ? await AppSettingsService.getFranchiseMarkupPercent()
    : null;
  const comboRules = needsFranchise ? await loadComboRulesSafe() : [];
  return requests.map((r) => formatSingleTransferRequest(r, user, markup, comboRules));
};

const formatTransferRequestForUser = async (request, user) => {
  if (!request) return request;
  const markup = isFranchiseWhToShopTransfer(request)
    ? await AppSettingsService.getFranchiseMarkupPercent()
    : null;
  const comboRules = markup != null ? await loadComboRulesSafe() : [];
  return formatSingleTransferRequest(request, user, markup, comboRules);
};

const formatBulkTransferRequestForUser = async (bulk, user) => {
  if (!bulk) return bulk;
  const markup = isFranchiseWhToShopTransfer(bulk)
    ? await AppSettingsService.getFranchiseMarkupPercent()
    : null;
  const comboRules = markup != null ? await loadComboRulesSafe() : [];
  const formatted = formatBulkTransferRequest(bulk, user, markup, comboRules);
  if (bulk.transfer_bill_number && bulk.transfer_bill_type) {
    const TransferBillService = require('../services/stock/transferBill.service');
    const billTotals = await TransferBillService.computeFranchiseBillTotalsFromBulk(bulk);
    if (billTotals) {
      formatted.franchise_bill_totals = billTotals;
    }
  }
  return formatted;
};

module.exports = {
  isFranchiseWhToShopTransfer,
  viewerIsFranchiseShop,
  formatSingleTransferRequest,
  formatBulkTransferRequest,
  formatTransferRequestsForUser,
  formatTransferRequestForUser,
  formatBulkTransferRequestForUser,
  buildFranchisePricingBlock,
  buildFranchiseSnapshotsWithCombo,
  snapshotSameProductFranchiseCombo,
  expandFranchiseBillSegments,
  emptyFranchiseComboFields,
};
