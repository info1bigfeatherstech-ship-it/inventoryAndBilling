const AppSettingsService = require('../services/settings/appSettings.service');
const { signBulkTransferBillToken, signSingleTransferBillToken } = require('./transferBillToken.utils');
const {
  calculateFranchiseUnitPrice,
  isFranchiseShopType,
  isWarehouseInternalRole,
} = require('./franchisePrice.utils');
const { roundMoney } = require('./billing.utils');

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

const buildFranchisePricingBlock = ({ snapshots, variant, quantity, markupPercent }) => {
  const qty = Number(quantity) || 0;
  const franchiseUnit = resolveFranchiseUnitPrice(snapshots, variant, markupPercent);
  const mrp = resolveFranchiseMrp(snapshots, variant);
  const lineFranchise =
    snapshots?.franchise_line_value_snapshot != null
      ? snapshots.franchise_line_value_snapshot
      : roundMoney(franchiseUnit * qty);

  return {
    mrp,
    franchise_unit_price: franchiseUnit,
    franchise_line_value: lineFranchise,
    mrp_line_value: mrp != null ? roundMoney(mrp * qty) : null,
    markup_percent: snapshots?.franchise_markup_percent_snapshot ?? markupPercent,
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
    franchiseBillTotals = {
      mrp_subtotal: mrpSubtotal,
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
};
