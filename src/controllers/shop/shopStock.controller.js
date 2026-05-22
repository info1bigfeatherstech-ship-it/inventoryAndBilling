const asyncHandler = require('../../utils/asyncHandler.utils');
const ShopStockService = require('../../services/shop/shopStock.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const ShopStockController = {
  list: asyncHandler(async (req, res) => {
    const shopId = req.query.shop_id || req.user?.shopId;
    const { total, page, limit, stocks } = await ShopStockService.listShopStocks(shopId, req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shop stocks fetched successfully',
      data: stocks,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  lowStock: asyncHandler(async (req, res) => {
    const shopId = req.query.shop_id || req.user?.shopId;
    const data = await ShopStockService.getLowStockAlerts(shopId, req.user);
    return successResponse(res, req, { statusCode: 200, message: 'Low stock alerts fetched', data });
  }),

  getByVariant: asyncHandler(async (req, res) => {
    const shopId = req.query.shop_id || req.user?.shopId;
    const stock = await ShopStockService.getShopStock(shopId, req.params.variantId, req.user);
    return successResponse(res, req, { statusCode: 200, message: 'Shop stock fetched successfully', data: stock });
  }),

  update: asyncHandler(async (req, res) => {
    const shopId = req.body.shop_id || req.query.shop_id || req.user?.shopId;
    const result = await ShopStockService.updateShopStock(shopId, req.params.variantId, req.body, req.user);
    return successResponse(res, req, { statusCode: 200, message: 'Shop stock updated successfully', data: result });
  }),

  bulkUpdate: asyncHandler(async (req, res) => {
    const shopId = req.body.shop_id || req.query.shop_id || req.user?.shopId;
    const results = await ShopStockService.bulkUpdateShopStock(req.body.items, shopId, req.user);
    return successResponse(res, req, { statusCode: 200, message: 'Bulk shop stock update completed', data: results });
  }),
};

module.exports = ShopStockController;
