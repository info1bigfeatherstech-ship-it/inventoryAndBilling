const { AppError } = require('../../errors/AppError');
const { roundMoney } = require('../../utils/billing.utils');
const { isFranchiseWhToShopTransfer } = require('../../utils/franchiseTransferPricing.utils');
const TransferRequestService = require('./transferRequest.service');
const BulkTransferService = require('./bulkTransfer.service');
const TransferBillService = require('./transferBill.service');
const { TRANSFER_BILL_READY_STATUSES } = require('../../utils/transferBill.utils');
const { getDispatchQuantity } = require('../../utils/bulkTransfer.utils');

const CHALLAN_PRINT_STATUSES = new Set([
  'APPROVED',
  'DISPATCHED',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'COMPLETED',
]);

const REQUEST_TYPE_LABELS = {
  WH_TO_SHOP: 'Warehouse → Shop',
  WH_TO_WH: 'Warehouse → Warehouse',
  SHOP_TO_SHOP: 'Shop → Shop',
};

const lineMetaFromVariant = (variant) => ({
  brand_name: variant?.product?.brand_name || null,
  warranty: variant?.warranty || variant?.product?.warranty || null,
  attributes: variant?.attributes || null,
});

const buildIssuerRecipient = (record) => {
  if (record.request_type === 'WH_TO_WH') {
    const fromWh = record.from_warehouse;
    const toWh = record.to_warehouse;
    return {
      issuer: fromWh
        ? {
            code: fromWh.warehouse_code,
            name: fromWh.warehouse_name,
            address: fromWh.address,
            city: fromWh.city,
            manager_name: fromWh.manager_name,
          }
        : null,
      recipient: toWh
        ? {
            code: toWh.warehouse_code,
            name: toWh.warehouse_name,
            address: toWh.address,
            city: toWh.city,
          }
        : null,
    };
  }
  if (record.request_type === 'WH_TO_SHOP') {
    const fromWh = record.from_warehouse;
    const toShop = record.to_shop;
    return {
      issuer: fromWh
        ? {
            code: fromWh.warehouse_code,
            name: fromWh.warehouse_name,
            address: fromWh.address,
            city: fromWh.city,
            manager_name: fromWh.manager_name,
          }
        : null,
      recipient: toShop
        ? {
            code: toShop.shop_code,
            name: toShop.shop_name,
            address: toShop.address,
            city: toShop.city,
            pincode: toShop.pincode,
            phone: toShop.phone,
            state_code: toShop.state_code,
          }
        : null,
    };
  }
  if (record.request_type === 'SHOP_TO_SHOP') {
    const fromShop = record.from_shop;
    const toShop = record.to_shop;
    return {
      issuer: fromShop
        ? {
            code: fromShop.shop_code,
            name: fromShop.shop_name,
            address: fromShop.address,
            city: fromShop.city,
            phone: fromShop.phone,
          }
        : null,
      recipient: toShop
        ? {
            code: toShop.shop_code,
            name: toShop.shop_name,
            address: toShop.address,
            city: toShop.city,
            pincode: toShop.pincode,
            phone: toShop.phone,
            state_code: toShop.state_code,
          }
        : null,
    };
  }
  return { issuer: null, recipient: null };
};

const formatLocation = (entity, fallbackCode) => {
  if (!entity) return fallbackCode || '-';
  const name = entity.warehouse_name || entity.shop_name || fallbackCode || '-';
  const city = entity.city ? `, ${entity.city}` : '';
  return `${name}${city}`;
};

const buildCostLinesFromSingleRequest = (request) => {
  const qty =
    request.received_quantity > 0
      ? request.received_quantity
      : request.quantity;
  return [
    {
      product_name: request.variant?.product?.name,
      sku: request.variant?.sku || request.variant?.product_code,
      hsn_code: request.variant?.product?.hsn_code,
      batch_number: request.batch_number || '',
      quantity: qty,
      unit_cost: request.unit_cost_snapshot,
      line_value: request.line_value_snapshot,
      ...lineMetaFromVariant(request.variant),
    },
  ];
};

const buildFranchiseLinesFromSingleRequest = (request) => {
  const qty =
    request.received_quantity > 0
      ? request.received_quantity
      : request.quantity;
  const unitMrp = Number(request.franchise_mrp_snapshot) || 0;
  const unitFranchise = Number(request.franchise_unit_price_snapshot) || 0;
  const unitSpecial = Number(request.variant?.special_price) || 0;
  const lineMrp = roundMoney(unitMrp * qty);
  const lineFranchise = roundMoney(unitFranchise * qty);
  return [
    {
      product_name: request.variant?.product?.name,
      sku: request.variant?.sku || request.variant?.product_code,
      hsn_code: request.variant?.product?.hsn_code,
      batch_number: request.batch_number || '',
      quantity: qty,
      unit_mrp: unitMrp,
      unit_special_price: unitSpecial,
      unit_franchise_price: unitFranchise,
      line_mrp_total: lineMrp,
      line_franchise_total: lineFranchise,
      ...lineMetaFromVariant(request.variant),
    },
  ];
};

const resolveBulkLineQty = (bulk, item) => {
  const approvedQty = getDispatchQuantity(item);
  if (approvedQty > 0) return approvedQty;
  if (bulk.status === 'REQUESTED') {
    return Number(item.requested_quantity ?? item.quantity) || 0;
  }
  return 0;
};

const buildCostLinesFromBulk = (bulk) =>
  (bulk.items || [])
    .filter((item) => item.is_approved !== false && resolveBulkLineQty(bulk, item) > 0)
    .map((item) => {
      const qty = resolveBulkLineQty(bulk, item);
      const unitCost =
        item.unit_cost_snapshot != null
          ? item.unit_cost_snapshot
          : item.variant?.purchase_price != null
            ? Number(item.variant.purchase_price)
            : null;
      const lineValue =
        item.line_value_snapshot != null
          ? item.line_value_snapshot
          : unitCost != null
            ? roundMoney(unitCost * qty)
            : null;
      return {
        product_name: item.variant?.product?.name,
        sku: item.variant?.sku || item.variant?.product_code,
        hsn_code: item.variant?.product?.hsn_code,
        batch_number: item.batch_number || '',
        quantity: qty,
        unit_cost: unitCost,
        line_value: lineValue,
        ...lineMetaFromVariant(item.variant),
      };
    });

const buildFranchiseLinesFromBulk = (bulk) =>
  (bulk.items || [])
    .filter((item) => item.is_approved !== false && resolveBulkLineQty(bulk, item) > 0)
    .map((item) => {
      const qty = resolveBulkLineQty(bulk, item);
      const unitMrp = Number(item.franchise_mrp_snapshot) || 0;
      const unitFranchise = Number(item.franchise_unit_price_snapshot) || 0;
      const unitSpecial = Number(item.variant?.special_price) || 0;
      const lineMrp = roundMoney(unitMrp * qty);
      const lineFranchise = roundMoney(unitFranchise * qty);
      return {
        product_name: item.variant?.product?.name,
        sku: item.variant?.sku || item.variant?.product_code,
        hsn_code: item.variant?.product?.hsn_code,
        batch_number: item.batch_number || '',
        quantity: qty,
        unit_mrp: unitMrp,
        unit_special_price: unitSpecial,
        unit_franchise_price: unitFranchise,
        line_mrp_total: lineMrp,
        line_franchise_total: lineFranchise,
        ...lineMetaFromVariant(item.variant),
      };
    });

const computeFranchiseBillTotals = (lines) => {
  const mrpSubtotal = roundMoney(
    lines.reduce((sum, line) => sum + (Number(line.line_mrp_total) || 0), 0)
  );
  const franchiseSubtotal = roundMoney(
    lines.reduce((sum, line) => sum + (Number(line.line_franchise_total) || 0), 0)
  );
  const specialSubtotal = roundMoney(
    lines.reduce(
      (sum, line) =>
        sum + roundMoney((Number(line.unit_special_price) || 0) * (Number(line.quantity) || 0)),
      0
    )
  );
  return {
    mrp_subtotal: mrpSubtotal,
    special_subtotal: specialSubtotal,
    franchise_subtotal: franchiseSubtotal,
    discount: roundMoney(mrpSubtotal - franchiseSubtotal),
    final_amount: franchiseSubtotal,
  };
};

const resolveFromTo = (record) => {
  if (record.request_type === 'WH_TO_WH') {
    return {
      from_label: formatLocation(record.from_warehouse, record.from_warehouse?.warehouse_code),
      to_label: formatLocation(record.to_warehouse, record.to_warehouse?.warehouse_code),
      from_address: null,
      to_address: null,
    };
  }
  if (record.request_type === 'WH_TO_SHOP') {
    return {
      from_label: formatLocation(record.from_warehouse, record.from_warehouse?.warehouse_code),
      to_label: formatLocation(record.to_shop, record.to_shop?.shop_code),
      from_address: null,
      to_address: null,
    };
  }
  if (record.request_type === 'SHOP_TO_SHOP') {
    return {
      from_label: formatLocation(record.from_shop, record.from_shop?.shop_code),
      to_label: formatLocation(record.to_shop, record.to_shop?.shop_code),
      from_address: null,
      to_address: null,
    };
  }
  return {
    from_label: '-',
    to_label: '-',
    from_address: null,
    to_address: null,
  };
};

const assertFranchiseSnapshotsReady = (record, lines) => {
  if (!lines.length) {
    throw new AppError('Challan has no line items to print', 400, 'CHALLAN_EMPTY');
  }
  const missing = lines.some(
    (line) => line.unit_franchise_price == null || line.unit_mrp == null
  );
  if (missing) {
    throw new AppError(
      'Franchise transfer bill pricing is not ready yet — approve the request with a bill type first',
      409,
      'FRANCHISE_BILL_NOT_READY'
    );
  }
  if (record.request_type === 'WH_TO_SHOP' && !isFranchiseWhToShopTransfer(record)) {
    throw new AppError('Not a franchise shop transfer', 400, 'NOT_FRANCHISE_TRANSFER');
  }
};

const TransferChallanService = {
  async buildSingleRequestChallan(requestId, user) {
    const request = await TransferRequestService.getRequestById(requestId, user);

    if (request.transfer_bill_number && request.transfer_bill_type) {
      if (!TRANSFER_BILL_READY_STATUSES.has(request.status)) {
        throw new AppError(
          'Transfer bill is available after approval',
          409,
          'TRANSFER_BILL_NOT_READY'
        );
      }
      return TransferBillService.buildSingleTransferBillDocument(requestId);
    }

    if (!CHALLAN_PRINT_STATUSES.has(request.status)) {
      throw new AppError(
        'Challan is available after dispatch (DISPATCHED or later)',
        409,
        'CHALLAN_NOT_READY'
      );
    }

    const { from_label, to_label, from_address, to_address } = resolveFromTo(request);
    const { issuer, recipient } = buildIssuerRecipient(request);
    const isFranchiseBill = isFranchiseWhToShopTransfer(request);
    const lines = isFranchiseBill
      ? buildFranchiseLinesFromSingleRequest(request)
      : buildCostLinesFromSingleRequest(request);

    if (isFranchiseBill) {
      assertFranchiseSnapshotsReady(request, lines);
    }

    const payload = {
      document_number: request.request_number,
      request_type: request.request_type,
      status: request.status,
      document_date: request.transfer_bill_generated_at || request.approved_at || request.dispatched_at || request.updated_at,
      tracking_number: request.tracking_number,
      from_label,
      from_address,
      to_label,
      to_address,
      issuer,
      recipient,
      request_type_label: REQUEST_TYPE_LABELS[request.request_type] || request.request_type,
      remarks: request.request_remarks,
      is_franchise_bill: isFranchiseBill,
      bill_format: isFranchiseBill ? 'FRANCHISE' : 'COST',
      lines,
    };

    if (isFranchiseBill) {
      payload.franchise_bill_totals = computeFranchiseBillTotals(lines);
      payload.markup_percent = request.franchise_markup_percent_snapshot;
    }

    return payload;
  },

  async buildBulkRequestChallan(bulkRequestId, user) {
    const bulk = await BulkTransferService.getBulkRequestById(bulkRequestId, user);

    if (bulk.transfer_bill_number && bulk.transfer_bill_type) {
      if (!TRANSFER_BILL_READY_STATUSES.has(bulk.status)) {
        throw new AppError(
          'Transfer bill is available after approval',
          409,
          'TRANSFER_BILL_NOT_READY'
        );
      }
      return TransferBillService.buildBulkTransferBillDocument(bulkRequestId);
    }

    if (!CHALLAN_PRINT_STATUSES.has(bulk.status)) {
      throw new AppError(
        'Challan is available after dispatch (DISPATCHED or later)',
        409,
        'CHALLAN_NOT_READY'
      );
    }

    const { from_label, to_label } = resolveFromTo(bulk);
    const { issuer, recipient } = buildIssuerRecipient(bulk);
    const isFranchiseBill = isFranchiseWhToShopTransfer(bulk);
    const lines = isFranchiseBill
      ? buildFranchiseLinesFromBulk(bulk)
      : buildCostLinesFromBulk(bulk);

    if (isFranchiseBill) {
      assertFranchiseSnapshotsReady(bulk, lines);
    }

    const payload = {
      document_number: bulk.bulk_request_number,
      request_type: bulk.request_type,
      status: bulk.status,
      document_date: bulk.transfer_bill_generated_at || bulk.approved_at || bulk.dispatched_at || bulk.updated_at,
      tracking_number: bulk.tracking_number,
      from_label,
      to_label,
      issuer,
      recipient,
      request_type_label: REQUEST_TYPE_LABELS[bulk.request_type] || bulk.request_type,
      remarks: bulk.request_remarks,
      is_franchise_bill: isFranchiseBill,
      bill_format: isFranchiseBill ? 'FRANCHISE' : 'COST',
      lines,
    };

    if (isFranchiseBill) {
      payload.franchise_bill_totals = computeFranchiseBillTotals(lines);
    }

    return payload;
  },
};

module.exports = TransferChallanService;
