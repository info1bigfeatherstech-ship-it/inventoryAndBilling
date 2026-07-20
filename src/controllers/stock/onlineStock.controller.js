const asyncHandler = require('../../utils/asyncHandler.utils');
const OnlineStockService = require('../../services/stock/onlineStock.service');
const { successResponse } = require('../../utils/response.utils');

const toPublicStockMap = (stock) => {
  const out = {};
  for (const [code, row] of Object.entries(stock || {})) {
    out[code] = { available: Number(row.available) || 0 };
  }
  return out;
};

const OnlineStockController = {
  batch: asyncHandler(async (req, res) => {
    const result = await OnlineStockService.batchStockByCodes(req.body.codes);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock batch fetched successfully',
      data: {
        warehouse_id: result.warehouse_id,
        missing: result.missing,
        stock: toPublicStockMap(result.stock),
      },
    });
  }),

  reserve: asyncHandler(async (req, res) => {
    const result = await OnlineStockService.reserve({
      orderId: req.body.orderId,
      storefront: req.body.storefront,
      lines: req.body.lines,
    });
    return successResponse(res, req, {
      statusCode: result.idempotent ? 200 : 201,
      message: result.idempotent ? 'Reservation already held (idempotent)' : 'Stock reserved successfully',
      data: result,
    });
  }),

  release: asyncHandler(async (req, res) => {
    const result = await OnlineStockService.release({
      orderId: req.body.orderId,
      lines: req.body.lines,
    });
    return successResponse(res, req, {
      statusCode: 200,
      message: result.idempotent ? 'Reservation already released (idempotent)' : 'Stock released successfully',
      data: result,
    });
  }),

  commit: asyncHandler(async (req, res) => {
    const result = await OnlineStockService.commit({
      orderId: req.body.orderId,
    });
    return successResponse(res, req, {
      statusCode: 200,
      message: result.idempotent ? 'Reservation already committed (idempotent)' : 'Stock committed successfully',
      data: result,
    });
  }),
};

module.exports = OnlineStockController;
