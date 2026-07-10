const asyncHandler = require('../../utils/asyncHandler.utils');
const TransferHistoryService = require('../../services/stock/transferHistory.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const TransferHistoryController = {
  list: asyncHandler(async (req, res) => {
    const result = await TransferHistoryService.listHistory(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer history fetched',
      data: result.transfers,
      meta: paginatedMeta({
        page: result.page,
        limit: result.limit,
        total: result.total,
      }),
    });
  }),
};

module.exports = TransferHistoryController;
