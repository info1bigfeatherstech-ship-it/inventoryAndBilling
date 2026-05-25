const asyncHandler = require('../../utils/asyncHandler.utils');
const ShopProductLevelService = require('../../services/stock/shopProductLevel.service');
const { successResponse } = require('../../utils/response.utils');

const ShopProductLevelController = {
  setLevels: asyncHandler(async (req, res) => {
    const data = await ShopProductLevelService.setProductLevels(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Product levels saved successfully',
      data,
    });
  }),

  reorderSuggestions: asyncHandler(async (req, res) => {
    const data = await ShopProductLevelService.getReorderSuggestions(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Reorder suggestions fetched successfully',
      data,
    });
  }),
};

module.exports = ShopProductLevelController;
