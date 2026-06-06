const asyncHandler = require('../../utils/asyncHandler.utils');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');
const PurchaseEntryService = require('../../services/purchase/purchaseEntry.service');
const PurchasePerformanceService = require('../../services/purchase/purchasePerformance.service');

const PurchaseEntryController = {
  /**
   * List all purchase entries
   * GET /api/v1/purchase-entries
   */
  list: asyncHandler(async (req, res) => {
    const { total, page, limit, purchases } = await PurchaseEntryService.listPurchaseEntries(req.query, req.user);

    return successResponse(res, req, {
      statusCode: 200,
      message: 'Purchase entries fetched successfully',
      data: purchases,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  /**
   * Get single purchase entry by ID
   * GET /api/v1/purchase-entries/:purchaseId
   */
  downloadPdf: asyncHandler(async (req, res) => {
    const purchase = await PurchaseEntryService.getPurchaseEntryById(req.params.purchaseId, req.user);
    const { buffer } = await PurchaseEntryService.generatePurchasePdf(req.params.purchaseId, req.user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="purchase-${purchase.purchase_number}.pdf"`);
    return res.send(buffer);
  }),

  getById: asyncHandler(async (req, res) => {
    const purchase = await PurchaseEntryService.getPurchaseEntryById(req.params.purchaseId, req.user);

    return successResponse(res, req, {
      statusCode: 200,
      message: 'Purchase entry fetched successfully',
      data: purchase,
    });
  }),

  /**
   * Get purchase summary by vendor (for reports)
   * GET /api/v1/purchase-entries/summary/vendor
   */
  vendorSummary: asyncHandler(async (req, res) => {
    const summary = await PurchaseEntryService.getPurchaseSummaryByVendor(req.query, req.user);

    return successResponse(res, req, {
      statusCode: 200,
      message: 'Purchase summary fetched successfully',
      data: summary,
    });
  }),

  performance: asyncHandler(async (req, res) => {
    const data = await PurchasePerformanceService.getPerformance(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Purchase performance fetched successfully',
      data,
    });
  }),
};

module.exports = PurchaseEntryController;