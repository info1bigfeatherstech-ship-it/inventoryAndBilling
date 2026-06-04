// const asyncHandler = require('../../utils/asyncHandler.utils');
// const StockLedgerService = require('../../services/stock/stockLedger.service');
// const { successResponse, paginatedMeta } = require('../../utils/response.utils');

// const StockLedgerController = {
//   list: asyncHandler(async (req, res) => {
//     const { total, page, limit, entries } = await StockLedgerService.getLedgerEntries(req.query, req.query);
//     return successResponse(res, req, {
//       statusCode: 200,
//       message: 'Stock ledger entries fetched',
//       data: entries,
//       meta: paginatedMeta({ page, limit, total }),
//     });
//   }),

//   byVariant: asyncHandler(async (req, res) => {
//     const { total, page, limit, entries } = await StockLedgerService.getVariantLedger(
//       req.params.variantId,
//       req.query
//     );
//     return successResponse(res, req, {
//       statusCode: 200,
//       message: 'Variant ledger fetched',
//       data: entries,
//       meta: paginatedMeta({ page, limit, total }),
//     });
//   }),

//   byWarehouse: asyncHandler(async (req, res) => {
//     const { total, page, limit, entries } = await StockLedgerService.getWarehouseLedger(
//       req.params.warehouseId,
//       req.query
//     );
//     return successResponse(res, req, {
//       statusCode: 200,
//       message: 'Warehouse ledger fetched',
//       data: entries,
//       meta: paginatedMeta({ page, limit, total }),
//     });
//   }),

//   byShop: asyncHandler(async (req, res) => {
//     const { total, page, limit, entries } = await StockLedgerService.getShopLedger(req.params.shopId, req.query);
//     return successResponse(res, req, {
//       statusCode: 200,
//       message: 'Shop ledger fetched',
//       data: entries,
//       meta: paginatedMeta({ page, limit, total }),
//     });
//   }),
// };

// module.exports = StockLedgerController;


const asyncHandler = require('../../utils/asyncHandler.utils');
const StockLedgerService = require('../../services/stock/stockLedger.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const StockLedgerController = {
  list: asyncHandler(async (req, res) => {
    // ⭐ Pass req.user
    const { total, page, limit, entries } = await StockLedgerService.getLedgerEntries(req.query, req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock ledger entries fetched',
      data: entries,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  byVariant: asyncHandler(async (req, res) => {
    // ⭐ Pass req.user
    const { total, page, limit, entries } = await StockLedgerService.getVariantLedger(
      req.params.variantId,
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Variant ledger fetched',
      data: entries,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  byWarehouse: asyncHandler(async (req, res) => {
    // ⭐ Pass req.user
    const { total, page, limit, entries } = await StockLedgerService.getWarehouseLedger(
      req.params.warehouseId,
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Warehouse ledger fetched',
      data: entries,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  byShop: asyncHandler(async (req, res) => {
    // ⭐ Pass req.user
    const { total, page, limit, entries } = await StockLedgerService.getShopLedger(
      req.params.shopId,
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shop ledger fetched',
      data: entries,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  exportCsv: asyncHandler(async (req, res) => {
    const { csv, filename } = await StockLedgerService.exportLedgerCsv(req.query, req.user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }),
};

module.exports = StockLedgerController;