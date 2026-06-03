const { param, query } = require('express-validator');

const warehousePeerCatalogValidator = [
  param('warehouseId').isString().trim().notEmpty(),
  query('from_warehouse_id').isString().trim().notEmpty(),
  query('mode').optional().isIn(['new', 'existing', 'all']),
  query('search').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

module.exports = { warehousePeerCatalogValidator };
