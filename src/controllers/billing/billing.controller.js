const asyncHandler = require('../../utils/asyncHandler.utils');
const BillingService = require('../../services/billing/billing.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const BillingController = {
  create: asyncHandler(async (req, res) => {
    const data = await BillingService.createBill(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Bill created successfully',
      data,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, bills } = await BillingService.listBills(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bills fetched successfully',
      data: bills,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await BillingService.getBillById(req.params.billId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bill fetched successfully',
      data,
    });
  }),

  addPayment: asyncHandler(async (req, res) => {
    const data = await BillingService.addPayment(req.params.billId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Payment recorded successfully',
      data,
    });
  }),

  cancel: asyncHandler(async (req, res) => {
    const data = await BillingService.cancelBill(req.params.billId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bill cancelled successfully',
      data,
    });
  }),

  dailySummary: asyncHandler(async (req, res) => {
    const data = await BillingService.getDailySummary(
      req.query.shop_id,
      req.query.date,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Daily summary fetched successfully',
      data,
    });
  }),

  gstReport: asyncHandler(async (req, res) => {
    const data = await BillingService.getGSTReport(
      req.query.shop_id,
      req.query.from_date,
      req.query.to_date,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'GST report fetched successfully',
      data,
    });
  }),

  downloadPDF: asyncHandler(async (req, res) => {
    const { bill, pdf } = await BillingService.generatePDF(req.params.billId, req.user, {
      persist: req.query.persist !== 'false',
    });

    if (req.query.format === 'json') {
      return successResponse(res, req, {
        statusCode: 200,
        message: 'Bill PDF generated',
        data: {
          bill_id: bill.bill_id,
          bill_number: bill.bill_number,
          pdf_storage_key: pdf.pdf_storage_key || bill.pdf_storage_key,
          pdf_url: pdf.pdf_url || null,
        },
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bill.bill_number}.pdf"`);
    return res.send(pdf.buffer);
  }),
};

module.exports = BillingController;
