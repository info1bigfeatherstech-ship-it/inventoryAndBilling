const asyncHandler = require('../../utils/asyncHandler.utils');
const CashbankService = require('../../services/cashbank/cashbank.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const CashbankController = {
  shopCollections: asyncHandler(async (req, res) => {
    const { total, page, limit, payments, summary, shop_id } =
      await CashbankService.listShopCollections(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shop collections fetched successfully',
      data: payments,
      meta: { ...paginatedMeta({ page, limit, total }), summary, shop_id },
    });
  }),

  shopReceivables: asyncHandler(async (req, res) => {
    const { total, page, limit, bills, summary, shop_id } =
      await CashbankService.listShopReceivables(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Customer receivables fetched successfully',
      data: bills,
      meta: { ...paginatedMeta({ page, limit, total }), summary, shop_id },
    });
  }),

  shopCashSummary: asyncHandler(async (req, res) => {
    const data = await CashbankService.getShopCashSummary(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shop cash summary fetched successfully',
      data,
    });
  }),

  shopBankTransactions: asyncHandler(async (req, res) => {
    const data = await CashbankService.listShopBankTransactions(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shop bank transactions fetched successfully',
      data,
    });
  }),
};

module.exports = CashbankController;
