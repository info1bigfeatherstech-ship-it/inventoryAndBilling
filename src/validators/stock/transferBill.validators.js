const { query, param } = require('express-validator');

const listTransferBillsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('from_date').optional().isISO8601().toDate(),
  query('to_date').optional().isISO8601().toDate(),
  query('transfer_bill_type')
    .optional()
    .isIn(['GST_INVOICE', 'NON_GST_INVOICE', 'ESTIMATE_INVOICE']),
  query('shop_id').optional().isString().trim().notEmpty(),
  query('warehouse_id').optional().isString().trim().notEmpty(),
  query('source').optional().isIn(['bulk', 'single']),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
];

const transferBillSourceParam = [
  param('source').isIn(['bulk', 'single']),
  param('id').isString().trim().notEmpty(),
];

module.exports = {
  listTransferBillsValidator,
  transferBillSourceParam,
};
