const { body, param, query } = require('express-validator');

const shopIdParam = [param('shopId').isString().trim().notEmpty()];

const SHOP_CODE_RE = /^[A-Z0-9_]{3,20}$/;

const createShopValidator = [
  body('shop_code')
    .isString()
    .trim()
    .custom((v) => {
      const code = String(v).trim().toUpperCase();
      if (!SHOP_CODE_RE.test(code)) {
        throw new Error('shop_code must be 3-20 uppercase alphanumeric characters or underscore');
      }
      return true;
    }),
  body('shop_name').isString().trim().isLength({ min: 2, max: 100 }),
  body('address').isString().trim().isLength({ min: 2, max: 300 }),
  body('city').isString().trim().isLength({ min: 2, max: 50 }),
  body('state_code')
    .optional({ nullable: true })
    .matches(/^\d{2}$/)
    .withMessage('state_code must be 2 digits (e.g. 27 for Maharashtra)'),
  body('phone').isString().trim().matches(/^[0-9]{10}$/).withMessage('phone must be a 10-digit number'),
  body('email').optional({ nullable: true }).isEmail(),
  body('owner_user_id')
    .optional({ nullable: true })
    .isString()
    .trim()
    .notEmpty()
    .withMessage('owner_user_id must be a valid user ID if provided'),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('sales_channels')
  .optional()
  .isArray()
  .withMessage('sales_channels must be an array'),
body('sales_channels.*')
  .optional()
  .isIn(['WALK_IN', 'ONLINE', 'WHOLESALE', 'MHM', 'OWB', 'OTHER'])
  .withMessage('Invalid sales channel'),
];

const updateShopValidator = [
  ...shopIdParam,
  body('shop_name').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('address').optional().isString().trim().isLength({ min: 2, max: 300 }),
  body('city').optional().isString().trim().isLength({ min: 2, max: 50 }),
  body('state_code').optional({ nullable: true }).matches(/^\d{2}$/),
  body('phone').optional().isString().trim().matches(/^[0-9]{10}$/),
  body('email').optional({ nullable: true }).isEmail(),
  body('is_active').optional().isBoolean().toBoolean(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  
  // ⭐ ADD THESE
  body('owner_user_id')
    .optional({ nullable: true })
    .isString()
    .trim()
    .notEmpty()
    .withMessage('owner_user_id must be a valid user ID if provided'),
  
  body('sales_channels')
    .optional()
    .isArray()
    .withMessage('sales_channels must be an array'),
  body('sales_channels.*')
    .optional()
    .isIn(['WALK_IN', 'ONLINE', 'WHOLESALE', 'MHM', 'OWB', 'OTHER'])
    .withMessage('Invalid sales channel'),
];

const listShopsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('city').optional().isString().trim(),
  query('is_active').optional().isBoolean().toBoolean(),
];

module.exports = {
  shopIdParam,
  createShopValidator,
  updateShopValidator,
  listShopsValidator,
};
