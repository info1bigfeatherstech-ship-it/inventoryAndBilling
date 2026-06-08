const { body, param, query } = require('express-validator');

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'];
const STATUSES = ['PENDING', 'PAID'];

const paymentIdParam = [param('paymentId').isString().trim().notEmpty()];

const listPaymentsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('warehouse_id').optional().isString().trim(),
  query('vendor_id').optional().isString().trim(),
  query('status').optional().isIn(['PENDING', 'PAID', 'CANCELLED']),
  query('search').optional().isString().trim().isLength({ max: 200 }),
  query('from_date').optional().isISO8601().toDate(),
  query('to_date').optional().isISO8601().toDate(),
];

const payablePurchasesValidator = [
  query('vendor_id').isString().trim().notEmpty(),
  query('warehouse_id').optional().isString().trim(),
  query('exclude_payment_id').optional().isString().trim(),
];

const purchaseIdParam = [param('purchaseId').isString().trim().notEmpty()];

const updatePaymentValidator = [
  ...paymentIdParam,
  body('amount').isFloat({ min: 0.01 }),
  body('payment_method').isIn(PAYMENT_METHODS),
  body('reference_no').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('payment_date').optional().isISO8601().toDate(),
  body('status').isIn(STATUSES),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('allocations').isArray({ min: 1 }),
  body('allocations.*.purchase_id').isString().trim().notEmpty(),
  body('allocations.*.allocated_amount').isFloat({ min: 0.01 }),
];

const settlementStatusValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('warehouse_id').optional().isString().trim(),
  query('vendor_id').optional().isString().trim(),
  query('search').optional().isString().trim().isLength({ max: 200 }),
  query('balance_filter').optional().isIn(['all', 'due', 'cleared', 'has_pending']),
];

const createPaymentValidator = [
  body('warehouse_id').optional().isString().trim(),
  body('vendor_id').isString().trim().notEmpty(),
  body('amount').isFloat({ min: 0.01 }),
  body('payment_method').isIn(PAYMENT_METHODS),
  body('reference_no').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('payment_date').optional().isISO8601().toDate(),
  body('status').isIn(STATUSES),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('allocations').isArray({ min: 1 }),
  body('allocations.*.purchase_id').isString().trim().notEmpty(),
  body('allocations.*.allocated_amount').isFloat({ min: 0.01 }),
];

const updatePaymentStatusValidator = [
  ...paymentIdParam,
  body('status').isIn(STATUSES),
];

const performanceValidator = [
  query('warehouse_id').optional().isString().trim(),
  query('vendor_id').optional().isString().trim(),
  query('from_date').optional().isISO8601().toDate(),
  query('to_date').optional().isISO8601().toDate(),
];

module.exports = {
  paymentIdParam,
  purchaseIdParam,
  listPaymentsValidator,
  payablePurchasesValidator,
  createPaymentValidator,
  settlementStatusValidator,
  updatePaymentValidator,
  updatePaymentStatusValidator,
  performanceValidator,
};
