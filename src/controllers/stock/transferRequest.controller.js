const asyncHandler = require('../../utils/asyncHandler.utils');
const TransferRequestService = require('../../services/stock/transferRequest.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const TransferRequestController = {
  create: asyncHandler(async (req, res) => {
    const data = await TransferRequestService.createRequest(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Transfer request created successfully',
      data,
    });
  }),

  createEmergency: asyncHandler(async (req, res) => {
    const data = await TransferRequestService.createEmergencyRequest(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Emergency transfer request created successfully',
      data,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, requests } = await TransferRequestService.listRequests(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer requests fetched successfully',
      data: requests,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await TransferRequestService.getRequestById(req.params.requestId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer request fetched successfully',
      data,
    });
  }),

  getMyRequests: asyncHandler(async (req, res) => {
    const { total, page, limit, requests } = await TransferRequestService.getMyRequests(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Your transfer requests fetched successfully',
      data: requests,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  approve: asyncHandler(async (req, res) => {
    const data = await TransferRequestService.approveRequest(req.params.requestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer request approved successfully',
      data,
    });
  }),

  reject: asyncHandler(async (req, res) => {
    const data = await TransferRequestService.rejectRequest(req.params.requestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer request rejected successfully',
      data,
    });
  }),

  dispatch: asyncHandler(async (req, res) => {
    const data = await TransferRequestService.dispatchRequest(req.params.requestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer request dispatched successfully',
      data,
    });
  }),

  receive: asyncHandler(async (req, res) => {
    const data = await TransferRequestService.receiveRequest(req.params.requestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer request received successfully',
      data,
    });
  }),

  cancel: asyncHandler(async (req, res) => {
    const data = await TransferRequestService.cancelRequest(req.params.requestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer request cancelled successfully',
      data,
    });
  }),
};

module.exports = TransferRequestController;
