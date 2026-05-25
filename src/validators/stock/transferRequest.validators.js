const { body, param, query } = require('express-validator');

const REQUEST_TYPES = ['WH_TO_WH', 'WH_TO_SHOP', 'SHOP_TO_SHOP'];
const STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'DISPATCHED',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'COMPLETED',
  'CANCELLED',
];

const requestIdParam = [param('requestId').isString().trim().notEmpty()];

const createRequestValidator = [
  body('request_type').isIn(REQUEST_TYPES),
  body('from_warehouse_id').optional().isString().trim().notEmpty(),
  body('to_warehouse_id').optional().isString().trim().notEmpty(),
  body('from_shop_id').optional().isString().trim().notEmpty(),
  body('to_shop_id').optional().isString().trim().notEmpty(),
  body('variant_id').isString().trim().notEmpty(),
  body('quantity').isInt({ min: 1 }),
  body('batch_number').optional().isString().trim(),
  body('request_remarks').optional().isString().trim().isLength({ max: 500 }),
  body('expected_delivery').optional().isISO8601().toDate(),
];

const emergencyRequestValidator = [
  body('request_type').isIn(REQUEST_TYPES),
  body('from_warehouse_id').optional().isString().trim().notEmpty(),
  body('to_warehouse_id').optional().isString().trim().notEmpty(),
  body('from_shop_id').optional().isString().trim().notEmpty(),
  body('to_shop_id').optional().isString().trim().notEmpty(),
  body('variant_id').isString().trim().notEmpty(),
  body('quantity').isInt({ min: 1 }),
  body('batch_number').optional().isString().trim(),
  body('priority').optional().isIn(['HIGH', 'NORMAL']),
  body('request_remarks').optional().isString().trim().isLength({ max: 500 }),
  body('expected_delivery').optional().isISO8601().toDate(),
];

const listRequestsValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(STATUSES),
  query('request_type').optional().isIn(REQUEST_TYPES),
  query('from_warehouse_id').optional().isString().trim().notEmpty(),
  query('to_warehouse_id').optional().isString().trim().notEmpty(),
  query('from_shop_id').optional().isString().trim().notEmpty(),
  query('to_shop_id').optional().isString().trim().notEmpty(),
  query('variant_id').optional().isString().trim().notEmpty(),
];

const approveRejectValidator = [
  body('rejection_reason').optional().isString().trim().isLength({ max: 500 }),
];

const dispatchValidator = [
  body('tracking_number').optional().isString().trim().isLength({ max: 100 }),
  body('expected_delivery').optional().isISO8601().toDate(),
];

const receiveValidator = [
  body('received_quantity').optional().isInt({ min: 1 }),
  body('receive_remarks').optional().isString().trim().isLength({ max: 500 }),
];

const cancelValidator = [
  body('cancel_reason').optional().isString().trim().isLength({ max: 500 }),
];

const rejectValidator = [
  body('rejection_reason').isString().trim().notEmpty().isLength({ max: 500 }),
];

module.exports = {
  requestIdParam,
  createRequestValidator,
  emergencyRequestValidator,
  listRequestsValidator,
  approveRejectValidator,
  rejectValidator,
  dispatchValidator,
  receiveValidator,
  cancelValidator,
};
