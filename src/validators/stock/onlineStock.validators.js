const { body } = require('express-validator');

const batchStockValidator = [
  body('codes')
    .isArray({ min: 1 })
    .withMessage('codes must be a non-empty array'),
  body('codes.*')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('each code must be a non-empty string'),
];

const reserveStockValidator = [
  body('orderId').isString().trim().notEmpty().withMessage('orderId is required'),
  body('storefront').optional().isString().trim().isLength({ max: 64 }),
  body('lines').isArray({ min: 1 }).withMessage('lines must be a non-empty array'),
  body('lines.*.productCode')
    .optional()
    .isString()
    .trim()
    .notEmpty(),
  body('lines.*.product_code')
    .optional()
    .isString()
    .trim()
    .notEmpty(),
  body('lines.*.quantity').isInt({ min: 1 }).withMessage('quantity must be an integer >= 1'),
  body('lines.*').custom((line) => {
    if (!line?.productCode && !line?.product_code) {
      throw new Error('each line requires productCode');
    }
    return true;
  }),
];

const releaseStockValidator = [
  body('orderId').isString().trim().notEmpty().withMessage('orderId is required'),
  body('lines').optional().isArray(),
  body('lines.*.productCode').optional().isString().trim().notEmpty(),
  body('lines.*.product_code').optional().isString().trim().notEmpty(),
  body('lines.*.quantity').optional().isInt({ min: 1 }),
];

const commitStockValidator = [
  body('orderId').isString().trim().notEmpty().withMessage('orderId is required'),
];

module.exports = {
  batchStockValidator,
  reserveStockValidator,
  releaseStockValidator,
  commitStockValidator,
};
