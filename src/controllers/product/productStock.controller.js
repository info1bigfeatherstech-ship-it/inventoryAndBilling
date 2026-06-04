const asyncHandler = require('../../utils/asyncHandler.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');
const ProductStockService = require('../../services/product/productStock.service');

const withUserContext = (req) => {
  const user = { ...req.user };
  if (req.user.role === 'SUPER_ADMIN' && req.query.warehouse_id) {
    user.requestedWarehouseFilter = req.query.warehouse_id;
  }
  return user;
};

const ProductStockController = {
  create: asyncHandler(async (req, res) => {
    const stock = await ProductStockService.createStock(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Stock record created successfully',
      data: stock,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, stocks, stats } = await ProductStockService.listStocks(req.query, withUserContext(req));
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock records fetched successfully',
      data: stocks,
      meta: {
        ...paginatedMeta({ page, limit, total }),
        ...(stats ? { stats } : {}),
      },
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const stock = await ProductStockService.getStockById(req.params.stockId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock record fetched successfully',
      data: stock,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const stock = await ProductStockService.updateStock(req.params.stockId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock record updated successfully',
      data: stock,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await ProductStockService.deleteStock(req.params.stockId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock record deleted successfully',
      data: result,
    });
  }),

  bulkCreateCsv: asyncHandler(async (req, res) => {
    if (!req.file?.buffer) {
      throw new AppError('CSV file is required (field name: file)', 400, 'CSV_FILE_REQUIRED');
    }

    const user = { ...req.user };
    const warehouseId = req.body?.warehouse_id || req.query?.warehouse_id;
    if (warehouseId) user.forcedWarehouseId = warehouseId;

    const results = await ProductStockService.bulkCreateFromCsv(req.file.buffer, user, { warehouseId });
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk stock import completed',
      data: results,
    });
  }),

  bulkUpdate: asyncHandler(async (req, res) => {
    const results = await ProductStockService.bulkUpdate(req.body.items, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk stock update completed',
      data: results,
    });
  }),

  bulkDelete: asyncHandler(async (req, res) => {
    const results = await ProductStockService.bulkDelete(req.body.stock_ids, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk stock delete completed',
      data: results,
    });
  }),
};

module.exports = ProductStockController;
