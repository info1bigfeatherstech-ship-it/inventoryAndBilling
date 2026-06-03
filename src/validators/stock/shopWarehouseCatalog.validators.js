const { param, query } = require('express-validator');

const shopIdParam = [param('shopId').isString().trim().notEmpty().withMessage('shopId is required')];

const warehouseStockCatalogValidator = [
  ...shopIdParam,
  query('warehouse_id').isString().trim().notEmpty().withMessage('warehouse_id is required'),
  query('mode')
    .optional()
    .isIn(['new', 'existing', 'all'])
    .withMessage('mode must be new, existing, or all'),
  query('search').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  warehouseStockCatalogValidator,
};
