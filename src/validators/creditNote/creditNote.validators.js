const { body, param, query } = require('express-validator');

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT_ON_ACCOUNT', 'CREDIT_NOTE_REDEMPTION'];
const CN_STATUSES = ['ACTIVE', 'REDEEMED', 'PARTIALLY_REDEEMED', 'REFUNDED', 'CANCELLED'];

const creditNoteIdParam = [param('creditNoteId').isString().trim().notEmpty()];

const createCreditNoteValidator = [
  body('original_bill_id').isString().trim().notEmpty(),
  body('items').isArray({ min: 1 }),
  body('items.*.variant_id').isString().trim().notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.unit_price').optional().isFloat({ min: 0 }),
  body('reason').optional().isString().trim().isLength({ max: 500 }),
  body('remarks').optional().isString().trim().isLength({ max: 500 }),
  body('refund_amount').optional().isFloat({ min: 0 }),
  body('restore_stock').optional().isBoolean().toBoolean(),
];

const listCreditNotesValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('shop_id').optional().isString().trim(),
  query('redeemable_at_shop').optional().isString().trim(),
  query('status').optional().isIn(CN_STATUSES),
  query('customer_id').optional().isString().trim(),
  query('customer_mobile').optional().isString().trim(),
  query('original_bill_id').optional().isString().trim(),
  query('credit_note_number').optional().isString().trim(),
];

const lookupCreditNoteValidator = [
  query('credit_note_number').isString().trim().notEmpty(),
  query('redeeming_shop_id').optional().isString().trim(),
  query('shop_id').optional().isString().trim(),
];

const redeemCreditNoteValidator = [
  ...creditNoteIdParam,
  body('against_bill_id').isString().trim().notEmpty(),
  body('redeemed_amount').isFloat({ min: 0.01 }),
];

const refundCreditNoteValidator = [
  ...creditNoteIdParam,
  body('refund_amount').isFloat({ min: 0.01 }),
  body('refund_method').isIn(PAYMENT_METHODS.filter((m) => m !== 'CREDIT_NOTE_REDEMPTION')),
  body('reference_no').optional().isString().trim().isLength({ max: 100 }),
];

const cancelCreditNoteValidator = [
  ...creditNoteIdParam,
  body('reason').isString().trim().isLength({ min: 5, max: 500 }),
  body('reverse_stock').optional().isBoolean().toBoolean(),
];

module.exports = {
  creditNoteIdParam,
  createCreditNoteValidator,
  listCreditNotesValidator,
  lookupCreditNoteValidator,
  redeemCreditNoteValidator,
  refundCreditNoteValidator,
  cancelCreditNoteValidator,
};
