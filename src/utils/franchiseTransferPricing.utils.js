const AppSettingsService = require('../services/settings/appSettings.service');
const { signBulkTransferBillToken, signSingleTransferBillToken } = require('./transferBillToken.utils');
const {
  calculateFranchiseUnitPrice,
  snapshotFranchiseTransferPricing,
  isFranchiseShopType,
  isWarehouseInternalRole,
} = require('./franchisePrice.utils');
const { applyComboPricingToLines } = require('./comboPricing.utils');
const { roundMoney } = require('./billing.utils');

/**
 * Build franchise snapshots for transfer lines, applying global combo set-math.
 * Grouping uses special_price; leftover units settle at F.Price (normal_unit_price).
 * Fail-soft: on combo errors returns pure F.Price snapshots.
 *
 * @param {Array<{ key: string, quantity: number, variant: object }>} lines
 * @param {number} markupPercent
 * @param {Array} rules
 * @returns {Map<string, object>}
 */
const buildFranchiseSnapshotsWithCombo = (lines, markupPercent, rules = []) => {
  const result = new Map();
  const safeLines = Array.isArray(lines) ? lines : [];

  const comboInput = [];
  for (const line of safeLines) {
    const qty = Math.max(0, Math.floor(Number(line.quantity) || 0));
    const snap = snapshotFranchiseTransferPricing(line.variant, qty, markupPercent);
    const base = {
      ...snap,
      franchise_combo_applied: false,
      franchise_combo_unit_price: null,
      franchise_combo_units: 0,
      franchise_normal_units: qty,
    };
    result.set(String(line.key), base);
    if (qty <= 0) continue;
    comboInput.push({
      line_key: String(line.key),
      variant_id: line.variant?.variant_id,
      quantity: qty,
      special_price: Number(line.variant?.special_price) || 0,
      normal_unit_price: snap.franchise_unit_price_snapshot,
      combo_eligible: line.variant?.combo_eligible === true,
    });
  }

  if (!comboInput.length || !Array.isArray(rules) || !rules.length) {
    return result;
  }

  try {
    const priced = applyComboPricingToLines(comboInput, rules);
    for (const row of priced) {
      const existing = result.get(String(row.line_key));
      if (!existing) continue;
      if (!row.combo_applied) {
        existing.franchise_combo_applied = false;
        existing.franchise_combo_unit_price = null;
        existing.franchise_combo_units = 0;
        existing.franchise_normal_units = row.quantity;
        continue;
      }
      existing.franchise_line_value_snapshot = row.line_total;
      existing.franchise_combo_applied = true;
      existing.franchise_combo_unit_price =
        row.combo_unit_price != null ? Number(row.combo_unit_price) : null;
      existing.franchise_combo_units = Number(row.combo_units) || 0;
      existing.franchise_normal_units = Number(row.normal_units) || 0;
    }
  } catch {
    // Keep pure F.Price snapshots — do not fail transfer approve/dispatch.
  }

  return result;
};

const emptyFranchiseComboFields = () => ({
  franchise_combo_applied: false,
  franchise_combo_unit_price: null,
  franchise_combo_units: null,
  franchise_normal_units: null,
});

const isFranchiseWhToShopTransfer = (record) =>
  record?.request_type === 'WH_TO_SHOP' && isFranchiseShopType(record?.to_shop?.shop_type);

const viewerIsFranchiseShop = (user, record) => {
  if (!isFranchiseWhToShopTransfer(record)) return false;
  if (isWarehouseInternalRole(user?.role)) return false;
  if (user?.role === 'SUPER_ADMIN') return false;
  const shopId = user?.shopId || user?.shop_id;
  return Boolean(shopId && shopId === record.to_shop_id);
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
  const franchiseUnit = resolveFranchiseUnitPrice(snapshots, variant, markupPercent);
  const mrp = resolveFranchiseMrp(snapshots, variant);
  const specialPrice = resolveSpecialPrice(variant);
  const lineFranchise =
    snapshots?.franchise_line_value_snapshot != null
      ? snapshots.franchise_line_value_snapshot
      : roundMoney(franchiseUnit * qty);

  return {
    mrp,
    special_price: specialPrice,
    franchise_unit_price: franchiseUnit,
    franchise_line_value: lineFranchise,
    mrp_line_value: mrp != null ? roundMoney(mrp * qty) : null,
    special_line_value: specialPrice != null ? roundMoney(specialPrice * qty) : null,
    markup_percent: snapshots?.franchise_markup_percent_snapshot ?? markupPercent,
    combo_applied: snapshots?.franchise_combo_applied === true,
    combo_unit_price:
      snapshots?.franchise_combo_applied === true && snapshots?.franchise_combo_unit_price != null
        ? Number(snapshots.franchise_combo_unit_price)
        : null,
    combo_units: snapshots?.franchise_combo_units != null ? Number(snapshots.franchise_combo_units) : null,
    normal_units: snapshots?.franchise_normal_units != null ? Number(snapshots.franchise_normal_units) : null,
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

const formatSingleTransferRequest = (request, user, markupPercent) => {
  if (!isFranchiseWhToShopTransfer(request)) return request;

  const franchiseShopView = viewerIsFranchiseShop(user, request);
  const snapshots = {
    franchise_markup_percent_snapshot: request.franchise_markup_percent_snapshot,
    franchise_mrp_snapshot: request.franchise_mrp_snapshot,
    franchise_unit_price_snapshot: request.franchise_unit_price_snapshot,
    franchise_line_value_snapshot: request.franchise_line_value_snapshot,
  };

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

const formatBulkTransferItem = (item, user, bulk, markupPercent) => {
  if (!isFranchiseWhToShopTransfer(bulk)) return item;

  const franchiseShopView = viewerIsFranchiseShop(user, bulk);
  const qty = resolveItemBillQty(item, bulk);
  const snapshots = {
    franchise_markup_percent_snapshot: item.franchise_markup_percent_snapshot,
    franchise_mrp_snapshot: item.franchise_mrp_snapshot,
    franchise_unit_price_snapshot: item.franchise_unit_price_snapshot,
    franchise_line_value_snapshot: item.franchise_line_value_snapshot,
  };

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

const formatBulkTransferRequest = (bulk, user, markupPercent) => {
  if (!isFranchiseWhToShopTransfer(bulk)) return bulk;

  const franchiseShopView = viewerIsFranchiseShop(user, bulk);
  const items = (bulk.items || []).map((item) =>
    formatBulkTransferItem(item, user, bulk, markupPercent)
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

const formatTransferRequestsForUser = async (requests, user) => {
  if (!Array.isArray(requests) || !requests.length) return requests;
  const needsFranchise = requests.some(isFranchiseWhToShopTransfer);
  const markup = needsFranchise
    ? await AppSettingsService.getFranchiseMarkupPercent()
    : null;
  return requests.map((r) => formatSingleTransferRequest(r, user, markup));
};

const formatTransferRequestForUser = async (request, user) => {
  if (!request) return request;
  const markup = isFranchiseWhToShopTransfer(request)
    ? await AppSettingsService.getFranchiseMarkupPercent()
    : null;
  return formatSingleTransferRequest(request, user, markup);
};

const formatBulkTransferRequestForUser = async (bulk, user) => {
  if (!bulk) return bulk;
  const markup = isFranchiseWhToShopTransfer(bulk)
    ? await AppSettingsService.getFranchiseMarkupPercent()
    : null;
  const formatted = formatBulkTransferRequest(bulk, user, markup);
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
  emptyFranchiseComboFields,
};
