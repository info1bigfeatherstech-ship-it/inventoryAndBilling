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

  create: asyncHandler(async (req, res) => {
    const payment = await VendorPaymentService.create(req.user, req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Vendor payment recorded successfully',
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
