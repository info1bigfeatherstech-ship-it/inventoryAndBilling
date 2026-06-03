const asyncHandler = require('../../utils/asyncHandler.utils');
const ShopWarehouseCatalogService = require('../../services/stock/shopWarehouseCatalog.service');
const { successResponse } = require('../../utils/response.utils');

const ShopWarehouseCatalogController = {
  getCatalog: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseCatalogService.getWarehouseStockCatalog(
      req.params.shopId,
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Warehouse stock catalog fetched successfully',
      data,
    });
  }),
};

module.exports = ShopWarehouseCatalogController;
