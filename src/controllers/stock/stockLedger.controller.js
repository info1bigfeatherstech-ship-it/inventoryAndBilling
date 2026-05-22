const asyncHandler = require('../../utils/asyncHandler.utils');
const StockLedgerService = require('../../services/stock/stockLedger.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const StockLedgerController = {
  list: asyncHandler(async (req, res) => {
    const { total, page, limit, entries } = await StockLedgerService.getLedgerEntries(req.query, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock ledger entries fetched',
      data: entries,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  byVariant: asyncHandler(async (req, res) => {
    const { total, page, limit, entries } = await StockLedgerService.getVariantLedger(
      req.params.variantId,
      req.query
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Variant ledger fetched',
      data: entries,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  byWarehouse: asyncHandler(async (req, res) => {
    const { total, page, limit, entries } = await StockLedgerService.getWarehouseLedger(
      req.params.warehouseId,
      req.query
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Warehouse ledger fetched',
      data: entries,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  byShop: asyncHandler(async (req, res) => {
    const { total, page, limit, entries } = await StockLedgerService.getShopLedger(req.params.shopId, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shop ledger fetched',
      data: entries,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),
};

module.exports = StockLedgerController;
