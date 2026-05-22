const { param, query } = require('express-validator');

const purchaseIdParam = [
  param('purchaseId').isString().trim().notEmpty().withMessage('purchaseId is required'),
];

const listPurchaseEntriesValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('vendor_id').optional().isString().trim().notEmpty(),
  query('warehouse_id').optional().isString().trim().notEmpty(),
  query('status').optional().isString().trim(),
  query('from_date').optional().isISO8601().toDate(),
  query('to_date').optional().isISO8601().toDate(),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
];

module.exports = {
  purchaseIdParam,
  listPurchaseEntriesValidator,
};