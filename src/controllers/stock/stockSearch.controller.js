const asyncHandler = require('../../utils/asyncHandler.utils');
const StockSearchService = require('../../services/stock/stockSearch.service');
const { successResponse } = require('../../utils/response.utils');

const StockSearchController = {
  search: asyncHandler(async (req, res) => {
    const data = await StockSearchService.searchStock(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock search completed successfully',
      data,
    });
  }),
};

module.exports = StockSearchController;
