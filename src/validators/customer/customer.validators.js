const { body, param, query } = require('express-validator');

const CUSTOMER_TYPES = ['GST', 'WALK_IN'];

const customerIdParam = [param('customerId').isString().trim().notEmpty()];

const gstFieldValidators = [
  body('company_name')
    .if(body('customer_type').equals('GST'))
    .isString()
    .trim()
    .notEmpty()
    .withMessage('company_name is required for GST customers')
    .isLength({ min: 2, max: 200 }),
  body('gst_number')
    .if(body('customer_type').equals('GST'))
    .isString()
    .trim()
    .isLength({ min: 15, max: 15 })
    .withMessage('gst_number must be 15 characters'),
  body('address')
    .if(body('customer_type').equals('GST'))
    .isString()
    .trim()
    .notEmpty()
    .withMessage('address is required for GST customers')
    .isLength({ min: 2, max: 500 }),
  body('city')
    .if(body('customer_type').equals('GST'))
    .isString()
    .trim()
    .notEmpty()
    .withMessage('city is required for GST customers')
    .isLength({ min: 2, max: 100 }),
  body('state_code')
    .if(body('customer_type').equals('GST'))
    .isString()
    .trim()
    .notEmpty()
    .withMessage('state_code is required for GST customers')
    .matches(/^\d{2}$/)
    .withMessage('state_code must be 2 digits'),
  body('pincode')
    .if(body('customer_type').equals('GST'))
    .isString()
    .trim()
    .notEmpty()
    .withMessage('pincode is required for GST customers')
    .matches(/^\d{6}$/)
    .withMessage('pincode must be 6 digits'),
];

const createCustomerValidator = [
  body('mobile')
    .isString()
    .trim()
    .matches(/^\d{10}$/)
    .withMessage('mobile must be 10 digits'),
  body('name').isString().trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }),
  body('customer_type').optional().isIn(CUSTOMER_TYPES),
  body('email').optional({ nullable: true }).isEmail().normalizeEmail(),
  ...gstFieldValidators,
  body('credit_limit').optional({ nullable: true }).isFloat({ min: 0 }),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateCustomerValidator = [
  ...customerIdParam,
  body('mobile').optional().isString().trim().matches(/^\d{10}$/),
  body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('email').optional({ nullable: true }).isEmail().normalizeEmail(),
  body('company_name').optional().isString().trim().isLength({ min: 2, max: 200 }),
  body('gst_number')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ min: 15, max: 15 })
    .withMessage('gst_number must be 15 characters when provided'),
  body('address').optional().isString().trim().isLength({ min: 2, max: 500 }),
  body('city').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('state_code')
    .optional()
    .isString()
    .trim()
    .matches(/^\d{2}$/)
    .withMessage('state_code must be 2 digits'),
  body('pincode')
    .optional()
    .isString()
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('pincode must be 6 digits'),
  body('credit_limit').optional({ nullable: true }).isFloat({ min: 0 }),
  body('remarks').optional({ nullable: true }).isString().trim(),
  body('is_active').optional().isBoolean(),
];

const upgradeCustomerValidator = [
  ...customerIdParam,
  body('company_name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('company_name is required')
    .isLength({ min: 2, max: 200 }),
  body('gst_number')
    .isString()
    .trim()
    .isLength({ min: 15, max: 15 })
    .withMessage('gst_number must be 15 characters'),
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
];

const listCustomersValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('name').optional().isString().trim(),
  query('mobile').optional().isString().trim(),
  query('customer_type').optional().isIn(CUSTOMER_TYPES),
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
  upgradeCustomerValidator,
  listCustomersValidator,
  searchCustomersValidator,
  updateLoyaltyTier,
};
