const asyncHandler = require('../../utils/asyncHandler.utils');
const StockTransferService = require('../../services/stock/stockTransfer.service');
const { successResponse } = require('../../utils/response.utils');

const StockTransferController = {
  whToShop: asyncHandler(async (req, res) => {
    const data = await StockTransferService.transferWarehouseToShop(req.body, req.user);
    return successResponse(res, req, { statusCode: 200, message: 'Warehouse to shop transfer completed', data });
  }),

  whToWh: asyncHandler(async (req, res) => {
    const data = await StockTransferService.transferWarehouseToWarehouse(req.body, req.user);
    return successResponse(res, req, { statusCode: 200, message: 'Warehouse to warehouse transfer completed', data });
  }),

  shopToShop: asyncHandler(async (req, res) => {
    const data = await StockTransferService.transferShopToShop(req.body, req.user);
    return successResponse(res, req, { statusCode: 200, message: 'Shop to shop transfer completed', data });
  }),

  reconcile: asyncHandler(async (req, res) => {
    const data = await StockTransferService.reconcileStock(req.body, req.user);
    return successResponse(res, req, { statusCode: 200, message: 'Stock reconciliation completed', data });
  }),
};

module.exports = StockTransferController;
