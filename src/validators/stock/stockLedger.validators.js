const { param, query } = require('express-validator');

const listLedgerValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('variant_id').optional().isString().trim().notEmpty(),
  query('product_id').optional().isString().trim().notEmpty(),
  query('movement_type').optional().isString().trim().notEmpty(),
  query('reference_id').optional().isString().trim().notEmpty(),
  query('reference_type').optional().isString().trim().notEmpty(),
  query('from_date').optional().isISO8601(),
  query('to_date').optional().isISO8601(),
];

const variantIdParam = [param('variantId').isString().trim().notEmpty()];
const warehouseIdParam = [param('warehouseId').isString().trim().notEmpty()];
const shopIdParam = [param('shopId').isString().trim().notEmpty()];

const dateRangeQuery = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
];

module.exports = {
  listLedgerValidator,
  variantIdParam,
  warehouseIdParam,
  shopIdParam,
  dateRangeQuery,
};
