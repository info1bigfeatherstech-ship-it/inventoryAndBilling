const { body, param, query } = require('express-validator');

const bulkRequestIdParam = [param('bulkRequestId').isString().trim().notEmpty()];

const createBulkValidator = [
  body('to_shop_id').optional().isString().trim().notEmpty(),
  body('to_warehouse_id').optional().isString().trim().notEmpty(),
  body('from_warehouse_id').isString().trim().notEmpty(),
  body('request_type').optional().isIn(['WH_TO_SHOP', 'WH_TO_WH', 'SHOP_TO_SHOP']),
  body('request_remarks').optional().isString().trim().isLength({ max: 500 }),
  body('items').isArray({ min: 1, max: 100 }),
  body('items.*.variant_id').isString().trim().notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.batch_number').optional().isString().trim(),
];

const listBulkValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isString().trim(),
  query('to_shop_id').optional().isString().trim(),
  query('to_warehouse_id').optional().isString().trim(),
  query('from_warehouse_id').optional().isString().trim(),
];

const approveBulkValidator = [
  ...bulkRequestIdParam,
  body('items').optional().isArray(),
  body('items.*.variant_id').optional().isString().trim().notEmpty(),
  body('items.*.quantity').optional().isInt({ min: 0 }),
  body('items.*.approved').optional().isBoolean().toBoolean(),
  body('items.*.reason').optional().isString().trim().isLength({ max: 300 }),
];

const dispatchBulkValidator = [
  ...bulkRequestIdParam,
  body('tracking_number').optional().isString().trim().isLength({ max: 100 }),
  body('expected_delivery').optional().isISO8601().toDate(),
];

const receiveBulkValidator = [
  ...bulkRequestIdParam,
  body('items').optional().isArray(),
  body('items.*.variant_id').isString().trim().notEmpty(),
  body('items.*.received_quantity').isInt({ min: 0 }),
  body('items.*.remarks').optional().isString().trim().isLength({ max: 300 }),
  body('receive_remarks').optional().isString().trim().isLength({ max: 500 }),
];

const cancelBulkValidator = [
  ...bulkRequestIdParam,
  body('cancel_reason').optional().isString().trim().isLength({ max: 500 }),
];

const rejectBulkValidator = [
  ...bulkRequestIdParam,
  body('rejection_reason').isString().trim().isLength({ min: 1, max: 500 }),
];

module.exports = {
  bulkRequestIdParam,
  createBulkValidator,
  listBulkValidator,
  approveBulkValidator,
  rejectBulkValidator,
  dispatchBulkValidator,
  receiveBulkValidator,
  cancelBulkValidator,
};
