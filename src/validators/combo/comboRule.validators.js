const { body, param, query } = require('express-validator');

const comboRuleIdParam = [param('comboRuleId').isString().trim().notEmpty()];

const listComboRulesValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('is_active').optional().isBoolean().toBoolean(),
];

const createComboRuleValidator = [
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('special_price_group').isFloat({ gt: 0 }),
  body('trigger_qty').isInt({ min: 2 }),
  body('combo_price').isFloat({ gt: 0 }),
  body('is_active').optional().isBoolean().toBoolean(),
];

const updateComboRuleValidator = [
  ...comboRuleIdParam,
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('special_price_group').optional().isFloat({ gt: 0 }),
  body('trigger_qty').optional().isInt({ min: 2 }),
  body('combo_price').optional().isFloat({ gt: 0 }),
  body('is_active').optional().isBoolean().toBoolean(),
];

const setComboRuleActiveValidator = [
  ...comboRuleIdParam,
  body('is_active').isBoolean().toBoolean(),
];

module.exports = {
  comboRuleIdParam,
  listComboRulesValidator,
  createComboRuleValidator,
  updateComboRuleValidator,
  setComboRuleActiveValidator,
};
