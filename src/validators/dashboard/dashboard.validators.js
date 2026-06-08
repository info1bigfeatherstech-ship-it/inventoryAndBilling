const { query } = require('express-validator');

const monthlyOverviewValidator = [
  query('months').optional().isInt({ min: 1, max: 12 }).toInt(),
  query('shop_id').optional().isString().trim(),
  query('warehouse_id').optional().isString().trim(),
];

module.exports = {
  monthlyOverviewValidator,
};
