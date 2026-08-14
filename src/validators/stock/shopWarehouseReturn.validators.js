const { body, param, query } = require('express-validator');

const returnIdParam = [
  param('returnId').isString().trim().notEmpty().withMessage('returnId is required'),
];

const previewValidator = [
  query('bill_number').optional().isString().trim(),
  query('source_number').optional().isString().trim(),
  query('shop_id').optional().isString().trim(),
];

const createValidator = [
  body('bill_number').optional().isString().trim(),
  body('source_number').optional().isString().trim(),
  body('shop_id').optional().isString().trim(),
  body('return_reason').isString().trim().notEmpty().withMessage('return_reason is required'),
  body('request_remarks').optional().isString().trim(),
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.variant_id').isString().trim().notEmpty(),
  body('items.*.return_quantity').isInt({ min: 1 }),
  body().custom((_, { req }) => {
    const code = String(req.body?.bill_number || req.body?.source_number || '').trim();
    if (!code) throw new Error('bill_number or source_number is required');
    return true;
  }),
];

const listValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isString().trim(),
  query('shop_id').optional().isString().trim(),
  query('warehouse_id').optional().isString().trim(),
  query('search').optional().isString().trim(),
];

const approveValidator = [
  ...returnIdParam,
  body('return_bill_type')
    .optional()
    .isIn(['GST_INVOICE', 'NON_GST_INVOICE', 'ESTIMATE_INVOICE']),
  body('items').optional().isArray(),
  body('items.*.return_item_id').optional().isString().trim(),
  body('items.*.approved_quantity').optional().isInt({ min: 0 }),
];

const rejectValidator = [
  ...returnIdParam,
  body('rejection_reason').isString().trim().notEmpty(),
];

const receiveValidator = [
  ...returnIdParam,
  body('receive_remarks').optional().isString().trim(),
];

const cancelValidator = [
  ...returnIdParam,
  body('cancel_reason').optional().isString().trim(),
];

module.exports = {
  returnIdParam,
  previewValidator,
  createValidator,
  listValidator,
  approveValidator,
  rejectValidator,
  receiveValidator,
  cancelValidator,
};
