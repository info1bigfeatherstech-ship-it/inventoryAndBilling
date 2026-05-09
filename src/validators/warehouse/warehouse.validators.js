const { body, param, query } = require('express-validator');

const warehouseCodeRegex = /^[A-Z0-9_-]{3,20}$/;

const normalizeWarehouseCode = (value) => String(value || '').trim().toUpperCase();

const warehouseIdParam = [
  param('warehouseId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('warehouseId is required'),
];

const createWarehouseValidator = [
  body('warehouse_code')
    .customSanitizer(normalizeWarehouseCode)
    .matches(warehouseCodeRegex)
    .withMessage('warehouse_code must be 3-20 chars [A-Z, 0-9, _, -]'),

  body('warehouse_name')
    .isString()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('warehouse_name must be 2-150 characters'),

  body('address')
    .isString()
    .trim()
    .isLength({ min: 3, max: 500 })
    .withMessage('address must be 3-500 characters'),

  body('city')
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('city must be 2-100 characters'),

  body('manager_name')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('manager_name must be 2-100 characters'),

  body('remarks')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('remarks must be at most 500 characters'),
];

const updateWarehouseValidator = [
  ...warehouseIdParam,
  body('warehouse_code')
    .optional()
    .customSanitizer(normalizeWarehouseCode)
    .matches(warehouseCodeRegex)
    .withMessage('warehouse_code must be 3-20 chars [A-Z, 0-9, _, -]'),
  body('warehouse_name').optional().isString().trim().isLength({ min: 2, max: 150 }),
  body('address').optional().isString().trim().isLength({ min: 3, max: 500 }),
  body('city').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('manager_name').optional({ nullable: true }).isString().trim().isLength({ min: 2, max: 100 }),
  body('is_active').optional().isBoolean().withMessage('is_active must be boolean'),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const listWarehousesValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
  query('city').optional().isString().trim().isLength({ min: 1, max: 100 }),
  query('is_active').optional().isBoolean().toBoolean(),
];

module.exports = {
  warehouseIdParam,
  createWarehouseValidator,
  updateWarehouseValidator,
  listWarehousesValidator,
};
