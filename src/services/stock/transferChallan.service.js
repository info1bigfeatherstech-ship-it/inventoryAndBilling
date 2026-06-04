const { AppError } = require('../../errors/AppError');
const TransferRequestService = require('./transferRequest.service');
const BulkTransferService = require('./bulkTransfer.service');

const CHALLAN_PRINT_STATUSES = new Set([
  'DISPATCHED',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'COMPLETED',
]);

const formatLocation = (entity, fallbackCode) => {
  if (!entity) return fallbackCode || '-';
  const name = entity.warehouse_name || entity.shop_name || fallbackCode || '-';
  const city = entity.city ? `, ${entity.city}` : '';
  return `${name}${city}`;
};

const buildLinesFromSingleRequest = (request) => {
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
    },
  ];
};

const buildLinesFromBulk = (bulk) =>
  (bulk.items || [])
    .filter((item) => item.is_approved && (item.approved_quantity ?? item.quantity) > 0)
    .map((item) => {
      const qty = item.approved_quantity ?? item.quantity;
      return {
        product_name: item.variant?.product?.name,
        sku: item.variant?.sku || item.variant?.product_code,
        hsn_code: item.variant?.product?.hsn_code,
        batch_number: item.batch_number || '',
        quantity: qty,
        unit_cost: item.unit_cost_snapshot,
        line_value: item.line_value_snapshot,
      };
    });

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

const TransferChallanService = {
  async buildSingleRequestChallan(requestId, user) {
    const request = await TransferRequestService.getRequestById(requestId, user);
    if (!CHALLAN_PRINT_STATUSES.has(request.status)) {
      throw new AppError(
        'Challan is available after dispatch (DISPATCHED or later)',
        409,
        'CHALLAN_NOT_READY'
      );
    }

    const { from_label, to_label, from_address, to_address } = resolveFromTo(request);

    return {
      document_number: request.request_number,
      request_type: request.request_type,
      status: request.status,
      document_date: request.dispatched_at || request.updated_at,
      tracking_number: request.tracking_number,
      from_label,
      from_address,
      to_label,
      to_address,
      remarks: request.request_remarks,
      lines: buildLinesFromSingleRequest(request),
    };
  },

  async buildBulkRequestChallan(bulkRequestId, user) {
    const bulk = await BulkTransferService.getBulkRequestById(bulkRequestId, user);
    if (!CHALLAN_PRINT_STATUSES.has(bulk.status)) {
      throw new AppError(
        'Challan is available after dispatch (DISPATCHED or later)',
        409,
        'CHALLAN_NOT_READY'
      );
    }

    const { from_label, to_label } = resolveFromTo(bulk);

    return {
      document_number: bulk.bulk_request_number,
      request_type: bulk.request_type,
      status: bulk.status,
      document_date: bulk.dispatched_at || bulk.updated_at,
      tracking_number: bulk.tracking_number,
      from_label,
      to_label,
      remarks: bulk.request_remarks,
      lines: buildLinesFromBulk(bulk),
    };
  },
};

module.exports = TransferChallanService;
