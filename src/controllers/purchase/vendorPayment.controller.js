const asyncHandler = require('../../utils/asyncHandler.utils');
const VendorPaymentService = require('../../services/purchase/vendorPayment.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const VendorPaymentController = {
  list: asyncHandler(async (req, res) => {
    const { total, page, limit, payments, summary } = await VendorPaymentService.list(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Vendor payments fetched successfully',
      data: payments,
      meta: { ...paginatedMeta({ page, limit, total }), summary },
    });
  }),

  payablePurchases: asyncHandler(async (req, res) => {
    const purchases = await VendorPaymentService.getPayablePurchases(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Payable purchases fetched successfully',
      data: purchases,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const payment = await VendorPaymentService.getById(req.user, req.params.paymentId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Vendor payment fetched successfully',
      data: payment,
    });
  }),

  getByPurchase: asyncHandler(async (req, res) => {
    const history = await VendorPaymentService.getPaymentsByPurchase(req.user, req.params.purchaseId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Purchase payment history fetched successfully',
      data: history,
    });
  }),

  settlementStatus: asyncHandler(async (req, res) => {
    const { total, page, limit, bills, summary } = await VendorPaymentService.getSettlementStatus(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bill payment settlement status fetched successfully',
      data: bills,
      meta: { ...paginatedMeta({ page, limit, total }), summary },
    });
  }),

  create: asyncHandler(async (req, res) => {
    const payment = await VendorPaymentService.create(req.user, req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Vendor payment recorded successfully',
      data: payment,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const payment = await VendorPaymentService.update(req.user, req.params.paymentId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Vendor payment updated successfully',
      data: payment,
    });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const payment = await VendorPaymentService.updateStatus(req.user, req.params.paymentId, req.body.status);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Payment status updated successfully',
      data: payment,
    });
  }),

  cancel: asyncHandler(async (req, res) => {
    const payment = await VendorPaymentService.cancel(req.user, req.params.paymentId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Vendor payment cancelled successfully',
      data: payment,
    });
  }),
};

module.exports = VendorPaymentController;
