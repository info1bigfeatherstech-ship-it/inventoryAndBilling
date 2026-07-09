const asyncHandler = require('../../utils/asyncHandler.utils');
const { AppError } = require('../../errors/AppError');
const BulkTransferService = require('../../services/stock/bulkTransfer.service');
const TransferChallanService = require('../../services/stock/transferChallan.service');
const TransferBillService = require('../../services/stock/transferBill.service');
const { generateTransferChallanPdf } = require('../../services/stock/transferChallanPdf.service');
const { verifyTransferBillToken } = require('../../utils/transferBillToken.utils');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const BulkTransferController = {
  create: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.createBulkRequest(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Bulk transfer request created successfully',
      data: {
        bulk_request_id: data.bulk_request_id,
        bulk_request_number: data.bulk_request_number,
        status: data.status,
        items_count: data.items_count,
        total_quantity: data.total_quantity,
      },
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, requests } = await BulkTransferService.listBulkRequests(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer requests fetched successfully',
      data: requests,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  downloadChallanPdf: asyncHandler(async (req, res) => {
    const challanDoc = await TransferChallanService.buildBulkRequestChallan(
      req.params.bulkRequestId,
      req.user
    );
    const { buffer } = await generateTransferChallanPdf(challanDoc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="transfer-bill-${challanDoc.document_number}.pdf"`
    );
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

    if (decoded.kind !== 'bulk_transfer_bill' || !decoded.bulkRequestId) {
      throw new AppError('Invalid transfer bill link', 400, 'INVALID_LINK');
    }

    const challanDoc = await TransferBillService.buildBulkTransferBillDocument(decoded.bulkRequestId);
    const { buffer } = await generateTransferChallanPdf(challanDoc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="transfer-bill-${challanDoc.document_number}.pdf"`
    );
    return res.send(buffer);
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.getBulkRequestById(req.params.bulkRequestId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request fetched successfully',
      data,
    });
  }),

  approve: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.approveBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request approved successfully',
      data,
    });
  }),

  reject: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.rejectBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request rejected successfully',
      data,
    });
  }),

  dispatch: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.dispatchBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request dispatched successfully',
      data,
    });
  }),

  receive: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.receiveBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request received successfully',
      data,
    });
  }),

  cancel: asyncHandler(async (req, res) => {
    const data = await BulkTransferService.cancelBulkRequest(req.params.bulkRequestId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk transfer request cancelled successfully',
      data,
    });
  }),
};

module.exports = BulkTransferController;
