const { query } = require('express-validator');

const shopScopeQuery = [
  query('shop_id').optional().isString().trim().notEmpty(),
  query('from_date').optional().isISO8601().toDate(),
  query('to_date').optional().isISO8601().toDate(),
];

const listCollectionsValidator = [
  ...shopScopeQuery,
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('payment_method').optional().isString().trim(),
  query('search').optional().isString().trim().isLength({ max: 200 }),
];

const listReceivablesValidator = [
  ...shopScopeQuery,
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('search').optional().isString().trim().isLength({ max: 200 }),
];

const cashSummaryValidator = [
  ...shopScopeQuery,
  query('opening_balance').optional().isFloat({ min: 0 }).toFloat(),
];

const bankTransactionsValidator = [
  ...shopScopeQuery,
  query('bank_account_id').optional().isString().trim(),
];

module.exports = {
  listCollectionsValidator,
  listReceivablesValidator,
  cashSummaryValidator,
  bankTransactionsValidator,
};
