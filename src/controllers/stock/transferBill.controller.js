const asyncHandler = require('../../utils/asyncHandler.utils');
const { AppError } = require('../../errors/AppError');
const TransferBillHistoryService = require('../../services/stock/transferBillHistory.service');
const TransferBillService = require('../../services/stock/transferBill.service');
const { generateTransferChallanPdf } = require('../../services/stock/transferChallanPdf.service');
const { verifyTransferBillToken } = require('../../utils/transferBillToken.utils');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const TransferBillController = {
  list: asyncHandler(async (req, res) => {
    const { total, page, limit, bills } = await TransferBillHistoryService.listTransferBills(
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer bills fetched successfully',
      data: bills,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  summary: asyncHandler(async (req, res) => {
    const summary = await TransferBillHistoryService.getTransferBillSummary(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer bill summary fetched successfully',
      data: summary,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const detail = await TransferBillHistoryService.getTransferBillDetail(
      req.params.source,
      req.params.id,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Transfer bill fetched successfully',
      data: detail,
    });
  }),

  downloadPdf: asyncHandler(async (req, res) => {
    const { buffer, filename } = await TransferBillHistoryService.downloadTransferBillPdf(
      req.params.source,
      req.params.id,
      req.user
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(buffer);
  }),

  getPublicTransferBillPdf: asyncHandler(async (req, res) => {
    let decoded;
    try {
      decoded = verifyTransferBillToken(req.params.token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Transfer bill link has expired', 410, 'LINK_EXPIRED');
      }
      throw new AppError('Invalid transfer bill link', 400, 'INVALID_LINK');
    }

    let challanDoc;
    if (decoded.kind === 'bulk_transfer_bill' && decoded.bulkRequestId) {
      challanDoc = await TransferBillService.buildBulkTransferBillDocument(decoded.bulkRequestId);
    } else if (decoded.kind === 'single_transfer_bill' && decoded.requestId) {
      challanDoc = await TransferBillService.buildSingleTransferBillDocument(decoded.requestId);
    } else {
      throw new AppError('Invalid transfer bill link', 400, 'INVALID_LINK');
    }

    const { buffer } = await generateTransferChallanPdf(challanDoc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="transfer-bill-${challanDoc.document_number}.pdf"`
    );
    return res.send(buffer);
  }),
};

module.exports = TransferBillController;
