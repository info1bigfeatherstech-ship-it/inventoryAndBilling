const { body, param, query } = require('express-validator');

const normalizeCategoryName = (value) => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized;
};

const categoryIdParam = [
  param('categoryId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('categoryId is required'),
];

const parentIdBodyRule = () =>
  body('parent_id')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined) return true;
      if (typeof value === 'string' && value.trim() !== '') return true;
      throw new Error('parent_id must be null or a non-empty string');
    });

const createCategoryValidator = [
  body('name')
    .customSanitizer(normalizeCategoryName)
    .isLength({ min: 2, max: 120 })
    .withMessage('name must be 2-120 characters'),

  body('description')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('description must be at most 500 characters'),

  parentIdBodyRule(),

  body('remarks')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('remarks must be at most 500 characters'),
];

const updateCategoryValidator = [
  ...categoryIdParam,

  body('name')
    .optional()
    .customSanitizer(normalizeCategoryName)
    .isLength({ min: 2, max: 120 })
    .withMessage('name must be 2-120 characters'),

  body('description')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 500 }),

  parentIdBodyRule({ optional: true }),

  body('is_active')
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage('is_active must be boolean'),

  body('remarks')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 500 }),
];

const listCategoriesValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
  query('is_active').optional().isBoolean().toBoolean(),
  query('roots_only').optional().isBoolean().toBoolean(),
  query('parent_id').optional().isString().trim().notEmpty(),
];

module.exports = {
  categoryIdParam,
  createCategoryValidator,
  updateCategoryValidator,
  listCategoriesValidator,
};
