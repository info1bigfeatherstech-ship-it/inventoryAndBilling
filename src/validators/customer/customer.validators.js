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
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 15, max: 15 })
    .withMessage('gst_number must be 15 characters when provided'),
  body('address').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('city').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('state_code')
    .optional({ nullable: true })
    .matches(/^\d{2}$/)
    .withMessage('state_code must be 2 digits'),
  body('credit_limit').optional({ nullable: true }).isFloat({ min: 0 }),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateCustomerValidator = [
  ...customerIdParam,
  body('mobile').optional().isString().trim().matches(/^\d{10}$/),
  body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('email').optional({ nullable: true }).isEmail().normalizeEmail(),
  body('gst_number').optional({ nullable: true }).isString().trim().isLength({ min: 15, max: 15 }),
  body('address').optional({ nullable: true }).isString().trim(),
  body('city').optional({ nullable: true }).isString().trim(),
  body('state_code').optional({ nullable: true }).matches(/^\d{2}$/),
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

module.exports = {
  customerIdParam,
  createCustomerValidator,
  updateCustomerValidator,
  listCustomersValidator,
  searchCustomersValidator,
};
