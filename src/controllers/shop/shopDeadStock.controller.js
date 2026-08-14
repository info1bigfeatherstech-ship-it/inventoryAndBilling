const asyncHandler = require('../../utils/asyncHandler.utils');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');
const ShopDeadStockService = require('../../services/shop/shopDeadStock.service');

const ShopDeadStockController = {
  list: asyncHandler(async (req, res) => {
    const { total, page, limit, entries } = await ShopDeadStockService.listEntries(
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Dead stock history fetched',
      data: entries,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),
};

module.exports = ShopDeadStockController;
