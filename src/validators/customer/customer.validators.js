const { body, param, query } = require('express-validator');

const customerIdParam = [param('customerId').isString().trim().notEmpty()];

const createCustomerValidator = [
  body('mobile')
    .isString()
    .trim()
    .matches(/^\d{10}$/)
    .withMessage('mobile must be 10 digits'),
  body('name').isString().trim().isLength({ min: 2, max: 100 }),
  body('email').optional({ nullable: true }).isEmail().normalizeEmail(),
  body('gst_number')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ min: 15, max: 15 })
    .withMessage('gst_number must be 15 characters when provided'),
  body('address')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('address is required')
    .isLength({ min: 2, max: 500 }),
  body('city')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('city is required')
    .isLength({ min: 2, max: 100 }),
  body('state_code')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('state_code is required')
    .matches(/^\d{2}$/)
    .withMessage('state_code must be 2 digits'),
  body('pincode')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('pincode is required')
    .matches(/^\d{6}$/)
    .withMessage('pincode must be 6 digits'),
  body('credit_limit').optional({ nullable: true }).isFloat({ min: 0 }),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateCustomerValidator = [
  ...customerIdParam,
  body('mobile').optional().isString().trim().matches(/^\d{10}$/),
  body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('email').optional({ nullable: true }).isEmail().normalizeEmail(),
  body('gst_number')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ min: 15, max: 15 })
    .withMessage('gst_number must be 15 characters when provided'),
  body('address')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('address is required')
    .isLength({ min: 2, max: 500 }),
  body('city')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('city is required')
    .isLength({ min: 2, max: 100 }),
  body('state_code')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('state_code is required')
    .matches(/^\d{2}$/)
    .withMessage('state_code must be 2 digits'),
  body('pincode')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('pincode is required')
    .matches(/^\d{6}$/)
    .withMessage('pincode must be 6 digits'),
  body('credit_limit').optional({ nullable: true }).isFloat({ min: 0 }),
  body('remarks').optional({ nullable: true }).isString().trim(),
  body('is_active').optional().isBoolean(),
];

const listCustomersValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('name').optional().isString().trim(),
  query('mobile').optional().isString().trim(),
  query('loyalty_tier').optional().isIn(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']),
  query('include_inactive').optional().isBoolean().toBoolean(),
];

const searchCustomersValidator = [
  query('mobile').optional().isString().trim(),
  query('name').optional().isString().trim(),
];
const updateLoyaltyTier = [
  ...customerIdParam,
  body('loyalty_tier')
    .optional({ nullable: true })
    .isIn(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'])
    .withMessage('loyalty_tier must be BRONZE, SILVER, GOLD, PLATINUM, or null'),
];

module.exports = {
  customerIdParam,
  createCustomerValidator,
  updateCustomerValidator,
  listCustomersValidator,
  searchCustomersValidator,
  updateLoyaltyTier,
};
