const asyncHandler = require('../../utils/asyncHandler.utils');
const DebitNoteService = require('../../services/debitNote/debitNote.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const DebitNoteController = {
  create: asyncHandler(async (req, res) => {
    const data = await DebitNoteService.createDebitNote(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Debit note created successfully',
      data,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, debitNotes, summary } = await DebitNoteService.listDebitNotes(
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Debit notes fetched successfully',
      data: debitNotes,
      meta: { ...paginatedMeta({ page, limit, total }), summary },
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await DebitNoteService.getDebitNoteById(req.params.debitNoteId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Debit note fetched successfully',
      data,
    });
  }),

  returnableLines: asyncHandler(async (req, res) => {
    const data = await DebitNoteService.getPurchaseReturnableLines(req.params.purchaseId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Returnable purchase lines fetched successfully',
      data,
    });
  }),

  downloadPdf: asyncHandler(async (req, res) => {
    const { buffer, filename, contentType } = await DebitNoteService.generateDebitNotePdf(
      req.params.debitNoteId,
      req.user
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  }),

  cancel: asyncHandler(async (req, res) => {
    const data = await DebitNoteService.cancelDebitNote(req.params.debitNoteId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Debit note cancelled successfully',
      data,
    });
  }),
};

module.exports = DebitNoteController;
