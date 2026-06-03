const asyncHandler = require('../../utils/asyncHandler.utils');
const BulkTransferService = require('../../services/stock/bulkTransfer.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const BulkTransferController = {
  create: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.createBulkRequest(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Bulk transfer request created successfully',
      data: {
        bulk_request_id: data.bulk_request_id,
        bulk_request_number: data.bulk_request_number,
        status: data.status,
        items_count: data.items_count,
        total_quantity: data.total_quantity,
      },
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, requests } = await BulkTransferService.listBulkRequests(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer requests fetched successfully',
      data: requests,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.getBulkRequestById(req.params.bulkRequestId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request fetched successfully',
      data,
    });
  }),

  approve: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.approveBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request approved successfully',
      data,
    });
  }),

  reject: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.rejectBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request rejected successfully',
      data,
    });
  }),

  dispatch: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.dispatchBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request dispatched successfully',
      data,
    });
  }),

  receive: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.receiveBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request received successfully',
      data,
    });
  }),

  cancel: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.cancelBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request cancelled successfully',
      data,
    });
  }),
};

module.exports = BulkTransferController;
