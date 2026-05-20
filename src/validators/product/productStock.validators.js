const { body, param, query } = require('express-validator');

const stockIdParam = [param('stockId').isString().trim().notEmpty()];

const createStockValidator = [
  body('warehouse_id').optional().isString().trim().notEmpty(),
  body('variant_id').isString().trim().notEmpty(),
  body('quantity').isInt({ min: 0 }),
  body('room_zone').isString().trim().notEmpty(),
  body('rack_shelf').isString().trim().notEmpty(),
  body('position').optional({ nullable: true }).isString().trim(),
  body('batch_number').optional().isString().trim(),
  body('expiry_date').optional({ nullable: true }).isISO8601().toDate(),
  body('low_stock_threshold').optional().isInt({ min: 0 }),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateStockValidator = [
  ...stockIdParam,
  body('quantity').optional().isInt({ min: 0 }),
  body('room_zone').optional().isString().trim().notEmpty(),
  body('rack_shelf').optional().isString().trim().notEmpty(),
  body('position').optional({ nullable: true }).isString().trim(),
  body('batch_number').optional().isString().trim(),
  body('expiry_date').optional({ nullable: true }).isISO8601().toDate(),
  body('low_stock_threshold').optional().isInt({ min: 0 }),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const listStockValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
  query('variant_id').optional().isString().trim().notEmpty(),
  query('product_id').optional().isString().trim().notEmpty(),
  query('batch_number').optional().isString().trim(),
  query('warehouse_id').optional().isString().trim().notEmpty(),
];

const bulkStockUpdateValidator = [
  body('items').isArray({ min: 1 }),
  body('items.*.stock_id').isString().trim().notEmpty(),
];

const bulkStockDeleteValidator = [
  body('stock_ids').isArray({ min: 1 }),
  body('stock_ids.*').isString().trim().notEmpty(),
];

const bulkStockCsvValidator = [
  body('warehouse_id').optional().isString().trim().notEmpty(),
  query('warehouse_id').optional().isString().trim().notEmpty(),
];

module.exports = {
  stockIdParam,
  createStockValidator,
  updateStockValidator,
  listStockValidator,
  bulkStockUpdateValidator,
  bulkStockDeleteValidator,
  bulkStockCsvValidator,
};
