const asyncHandler = require('../../utils/asyncHandler.utils');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');
const purchaseEntryService = require('../../services/purchase/purchaseEntry.service');

const PurchaseEntryController = {
  list: asyncHandler(async (req, res) => {
    const { total, page, limit, purchases } = await purchaseEntryService.listPurchaseEntries(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Purchase entries fetched successfully',
      data: purchases,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),
  
  getById: asyncHandler(async (req, res) => {
    const purchase = await purchaseEntryService.getPurchaseEntryById(req.params.purchaseId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Purchase entry fetched successfully',
      data: purchase,
    });
  }),
};

module.exports = PurchaseEntryController;