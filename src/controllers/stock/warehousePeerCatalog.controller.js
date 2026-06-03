const asyncHandler = require('../../utils/asyncHandler.utils');
const WarehousePeerCatalogService = require('../../services/stock/warehousePeerCatalog.service');
const { successResponse } = require('../../utils/response.utils');

const WarehousePeerCatalogController = {
  getPeerStockCatalog: asyncHandler(async (req, res) => {
    const data = await WarehousePeerCatalogService.getPeerStockCatalog(
      req.params.warehouseId,
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Peer warehouse stock catalog fetched',
      data,
    });
  }),
};

module.exports = WarehousePeerCatalogController;
