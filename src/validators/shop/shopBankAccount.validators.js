const { body, param, query } = require('express-validator');

const shopIdParam = [param('shopId').isString().trim().notEmpty()];

const bankAccountIdParam = [
  param('shopId').isString().trim().notEmpty(),
  param('bankAccountId').isString().trim().notEmpty(),
];

const listBankAccountsValidator = [
  ...shopIdParam,
  query('active_only').optional().isIn(['true', 'false']),
  query('upi_only').optional().isIn(['true', 'false']),
];

const createBankAccountValidator = [
  ...shopIdParam,
  body('gst_config_id').optional({ nullable: true }).isString().trim(),
  body('account_holder_name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('bank_name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('branch_name').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('account_number').isString().trim().notEmpty(),
  body('ifsc_code').isString().trim().notEmpty().isLength({ min: 11, max: 11 }),
  body('upi_id').isString().trim().notEmpty().isLength({ max: 100 }),
  body('is_default').optional().isBoolean().toBoolean(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateBankAccountValidator = [
  ...bankAccountIdParam,
  body('account_holder_name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('bank_name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('branch_name').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('account_number').optional().isString().trim().notEmpty(),
  body('ifsc_code').optional().isString().trim().isLength({ min: 11, max: 11 }),
  body('upi_id').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('is_default').optional().isBoolean().toBoolean(),
  body('is_active').optional().isBoolean().toBoolean(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

module.exports = {
  shopIdParam,
  bankAccountIdParam,
  listBankAccountsValidator,
  createBankAccountValidator,
  updateBankAccountValidator,
};
