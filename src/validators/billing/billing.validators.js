const { body, param, query } = require('express-validator');

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT_ON_ACCOUNT', 'CREDIT_NOTE_REDEMPTION'];
const PRICE_TYPES = ['MRP', 'SPECIAL', 'RETAIL', 'WHOLESALE', 'ONLINE'];
const BILL_TYPES = ['GST_INVOICE', 'NON_GST_INVOICE', 'ESTIMATE_INVOICE', 'NON_LISTED_BILL'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'PARTIALLY_PAID', 'REFUNDED', 'CANCELLED'];

const billIdParam = [param('billId').isString().trim().notEmpty()];

const createBillValidator = [
  body('shop_id').optional().isString().trim().notEmpty(),
  body('customer_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('customer_mobile').optional({ nullable: true }).isString().trim(),
  body('customer_name').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('customer_gstin').optional({ nullable: true }).isString().trim().isLength({ max: 15 }),
  body('bill_type').optional().isIn(BILL_TYPES),
  body('place_of_supply_state_code').optional({ nullable: true }).matches(/^\d{2}$/),
  body('discount').optional().isFloat({ min: 0, max: 100 }),
  body('items').isArray({ min: 1 }),
  // Inventory items (GST / NON_GST / ESTIMATE)
  body('items.*.variant_id').optional({ nullable: true }).isString().trim(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.unit_price').isFloat({ min: 0 }),
  body('items.*.price_type').optional().isIn(PRICE_TYPES),
  body('items.*.discount').optional().isFloat({ min: 0 }),
  // Manual item fields (NON_LISTED_BILL only)
  body('items.*.item_name').optional({ nullable: true }).isString().trim().isLength({ min: 1, max: 200 }),
  body('items.*.mrp').optional({ nullable: true }).isFloat({ min: 0 }),
  body('payment_method').optional().isIn(PAYMENT_METHODS),
  body('payment_amount').optional().isFloat({ min: 0 }),
  body('reference_no').optional().isString().trim().isLength({ max: 100 }),
  body('sales_channel')
    .optional()
    .isIn(['WALK_IN', 'ONLINE', 'WHOLESALE', 'MHM', 'OWB', 'OTHER']),
  body('gst_config_id').optional({ nullable: true }).isString().trim(),
  body('bank_account_id').optional({ nullable: true }).isString().trim(),
  body('staff_code_id').optional({ nullable: true }).isString().trim(),
  body('credit_note_ids').optional().isArray(),
  body('credit_note_ids.*').optional().isString().trim().notEmpty(),
];

const listBillsValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('shop_id').optional().isString().trim(),
  query('customer_id').optional().isString().trim(),
  query('customer_mobile').optional().isString().trim(),
  query('bill_number').optional().isString().trim(),
  query('payment_status').optional().isIn(PAYMENT_STATUSES),
  query('is_cancelled').optional().isBoolean().toBoolean(),
  query('from_date').optional().isISO8601(),
  query('to_date').optional().isISO8601(),
];

const addPaymentValidator = [
  ...billIdParam,
  body('amount').isFloat({ min: 0.01 }),
  body('payment_method').isIn(PAYMENT_METHODS),
  body('reference_no').optional().isString().trim().isLength({ max: 100 }),
];

const cancelBillValidator = [
  ...billIdParam,
  body('reason').isString().trim().isLength({ min: 5, max: 500 }),
];

const dailySummaryValidator = [
  query('shop_id').optional().isString().trim().notEmpty(),
  query('date').optional().isISO8601().toDate(),
];

const gstReportValidator = [
  query('shop_id').optional().isString().trim().notEmpty(),
  query('from_date').isISO8601().toDate(),
  query('to_date').isISO8601().toDate(),
];

module.exports = {
  billIdParam,
  createBillValidator,
  listBillsValidator,
  addPaymentValidator,
  cancelBillValidator,
  dailySummaryValidator,
  gstReportValidator,
};
