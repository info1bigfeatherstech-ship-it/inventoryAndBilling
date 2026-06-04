const { body, param, query } = require('express-validator');

const DEBIT_NOTE_TYPES = ['SHORTAGE', 'DEFECTIVE', 'RATE_DIFFERENCE', 'OTHER'];
const DEBIT_NOTE_STATUSES = ['ISSUED', 'CANCELLED'];

const debitNoteIdParam = [param('debitNoteId').isString().trim().notEmpty()];
const purchaseIdParam = [param('purchaseId').isString().trim().notEmpty()];

const createDebitNoteValidator = [
  body('original_purchase_id').isString().trim().notEmpty(),
  body('type').isIn(DEBIT_NOTE_TYPES),
  body('items').isArray({ min: 1 }),
  body('items.*.purchase_item_id').isString().trim().notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('reason').optional().isString().trim().isLength({ max: 500 }),
  body('remarks').optional().isString().trim().isLength({ max: 500 }),
  body('return_stock').optional().isBoolean().toBoolean(),
];

const listDebitNotesValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('vendor_id').optional().isString().trim(),
  query('warehouse_id').optional().isString().trim(),
  query('status').optional().isIn(DEBIT_NOTE_STATUSES),
  query('type').optional().isIn(DEBIT_NOTE_TYPES),
  query('original_purchase_id').optional().isString().trim(),
  query('debit_note_number').optional().isString().trim(),
  query('search').optional().isString().trim(),
  query('from_date').optional().isISO8601(),
  query('to_date').optional().isISO8601(),
];

const cancelDebitNoteValidator = [
  ...debitNoteIdParam,
  body('reason').isString().trim().isLength({ min: 5, max: 500 }),
  body('reverse_stock').optional().isBoolean().toBoolean(),
];

module.exports = {
  debitNoteIdParam,
  purchaseIdParam,
  createDebitNoteValidator,
  listDebitNotesValidator,
  cancelDebitNoteValidator,
  DEBIT_NOTE_TYPES,
};
