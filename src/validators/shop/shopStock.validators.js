const { body, param, query } = require('express-validator');

const variantIdParam = [param('variantId').isString().trim().notEmpty()];

const listShopStocksValidator = [
  query('shop_id').optional().isString().trim().notEmpty(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('variant_id').optional().isString().trim().notEmpty(),
  query('min_quantity').optional().isInt({ min: 0 }).toInt(),
  query('low_stock_only').optional().isBoolean().toBoolean(),
];

const updateShopStockValidator = [
  ...variantIdParam,
  body('shop_id').optional().isString().trim().notEmpty(),
  body('quantity').isFloat({ min: 0 }),
  body('operation').optional().isIn(['set', 'increment', 'decrement']),
  body('reason').optional().isString().trim().isLength({ max: 500 }),
  body('remarks').optional().isString().trim().isLength({ max: 500 }),
  body('low_stock_threshold').optional().isInt({ min: 0 }).toInt(),
];

const bulkUpdateShopStockValidator = [
  body('shop_id').optional().isString().trim().notEmpty(),
  body('items').isArray({ min: 1 }),
  body('items.*.variant_id').isString().trim().notEmpty(),
  body('items.*.quantity').isFloat({ min: 0 }),
  body('items.*.operation').optional().isIn(['set', 'increment', 'decrement']),
];

module.exports = {
  variantIdParam,
  listShopStocksValidator,
  updateShopStockValidator,
  bulkUpdateShopStockValidator,
};
