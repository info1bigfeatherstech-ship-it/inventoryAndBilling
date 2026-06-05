const { body, param, query } = require('express-validator');

const shopIdParam = [param('shopId').isString().trim().notEmpty()];

const staffCodeIdParam = [
  param('shopId').isString().trim().notEmpty(),
  param('staffCodeId').isString().trim().notEmpty(),
];

const listStaffCodesValidator = [
  ...shopIdParam,
  query('active_only').optional().isIn(['true', 'false']),
];

const staffBillingSummaryValidator = [
  ...shopIdParam,
  query('from_date').optional().isISO8601().toDate(),
  query('to_date').optional().isISO8601().toDate(),
];

const createStaffCodeValidator = [
  ...shopIdParam,
  body('code').isString().trim().notEmpty().isLength({ min: 2, max: 15 }),
  body('display_name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('phone').optional({ nullable: true }).isString().trim(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateStaffCodeValidator = [
  ...staffCodeIdParam,
  body('display_name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('phone').optional({ nullable: true }).isString().trim(),
  body('is_active').optional().isBoolean().toBoolean(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

module.exports = {
  shopIdParam,
  staffCodeIdParam,
  listStaffCodesValidator,
  staffBillingSummaryValidator,
  createStaffCodeValidator,
  updateStaffCodeValidator,
};
