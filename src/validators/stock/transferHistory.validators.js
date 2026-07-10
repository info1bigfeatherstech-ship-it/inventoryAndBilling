const { query } = require('express-validator');

const listTransferHistoryValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isString().trim(),
  query('request_type').optional().isIn(['WH_TO_WH', 'WH_TO_SHOP', 'SHOP_TO_SHOP']),
  query('from_date').optional().isISO8601().toDate(),
  query('to_date').optional().isISO8601().toDate(),
];

module.exports = {
  listTransferHistoryValidator,
};
