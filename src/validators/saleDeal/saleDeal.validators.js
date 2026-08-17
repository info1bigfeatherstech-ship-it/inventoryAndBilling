const { body, param, query } = require('express-validator');

const saleDealIdParam = [param('saleDealId').isString().trim().notEmpty()];

const listSaleDealsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('is_active').optional().isBoolean().toBoolean(),
  query('live_only').optional().isBoolean().toBoolean(),
];

const searchSaleVariantsValidator = [
  query('search').isString().trim().notEmpty().isLength({ max: 120 }),
];

const createSaleDealValidator = [
  body('variant_id').isString().trim().notEmpty(),
  body('sale_price').isFloat({ gt: 0 }),
  body('expires_at').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
];

const updateSaleDealValidator = [
  ...saleDealIdParam,
  body('sale_price').optional().isFloat({ gt: 0 }),
  body('expires_at').optional({ nullable: true, checkFalsy: true }).isISO8601().toDate(),
];

const setSaleDealActiveValidator = [
  ...saleDealIdParam,
  body('is_active').isBoolean().toBoolean(),
];

module.exports = {
  saleDealIdParam,
  listSaleDealsValidator,
  searchSaleVariantsValidator,
  createSaleDealValidator,
  updateSaleDealValidator,
  setSaleDealActiveValidator,
};
