const asyncHandler = require('../../utils/asyncHandler.utils');
const CreditNoteService = require('../../services/creditNote/creditNote.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const CreditNoteController = {
  create: asyncHandler(async (req, res) => {
    const data = await CreditNoteService.createCreditNote(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Credit note created successfully',
      data,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, creditNotes } = await CreditNoteService.listCreditNotes(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Credit notes fetched successfully',
      data: creditNotes,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await CreditNoteService.getCreditNoteById(req.params.creditNoteId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Credit note fetched successfully',
      data,
    });
  }),

  redeem: asyncHandler(async (req, res) => {
    const data = await CreditNoteService.redeemCreditNote(req.params.creditNoteId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Credit note redeemed successfully',
      data,
    });
  }),

  refund: asyncHandler(async (req, res) => {
    const data = await CreditNoteService.refundCreditNote(req.params.creditNoteId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Credit note refunded successfully',
      data,
    });
  }),

  cancel: asyncHandler(async (req, res) => {
    const data = await CreditNoteService.cancelCreditNote(req.params.creditNoteId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Credit note cancelled successfully',
      data,
    });
  }),
};

module.exports = CreditNoteController;
