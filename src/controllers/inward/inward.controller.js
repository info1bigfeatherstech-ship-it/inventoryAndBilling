const asyncHandler = require('../../utils/asyncHandler.utils');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');
const InwardService = require('../../services/inward/inward.service');

const InwardController = {
  create: asyncHandler(async (req, res) => {
    const inward = await InwardService.createInward(req.body, req.user.userId, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Inward schedule created successfully',
      data: inward,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, inwards } = await InwardService.listInwards(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Inward schedules fetched successfully',
      data: inwards,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const inward = await InwardService.getInwardById(req.params.inwardId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Inward detail fetched successfully',
      data: inward,
    });
  }),

  updateArrivalDetails: asyncHandler(async (req, res) => {
    const inward = await InwardService.updateArrivalDetails(req.params.inwardId, req.user.userId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Arrival details updated successfully',
      data: inward,
    });
  }),

  addItem: asyncHandler(async (req, res) => {
    const item = await InwardService.addInwardItem(req.params.inwardId, req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Inward item added successfully',
      data: item,
    });
  }),
  // ========== ADD BULK ITEMS ==========
  addBulkItems: asyncHandler(async (req, res) => {
    const results = await InwardService.addBulkInwardItems(
      req.params.inwardId,
      req.body,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Bulk items added successfully',
      data: results,
    });
  }),

  updateItem: asyncHandler(async (req, res) => {
    const item = await InwardService.updateInwardItem(req.params.inwardId, req.params.inwardItemId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Inward item updated successfully',
      data: item,
    });
  }),

  removeItem: asyncHandler(async (req, res) => {
    await InwardService.removeInwardItem(req.params.inwardId, req.params.inwardItemId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Inward item removed successfully',
      data: { inward_id: req.params.inwardId, inward_item_id: req.params.inwardItemId },
    });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const inward = await InwardService.updateInwardStatus(
      req.params.inwardId,
      req.body.status,
      req.user.userId,
      req.body.remarks
    );

    return successResponse(res, req, {
      statusCode: 200,
      message: 'Inward status updated successfully',
      data: inward,
    });
  }),
};

module.exports = InwardController;
