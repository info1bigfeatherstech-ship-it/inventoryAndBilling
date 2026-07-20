const { body } = require('express-validator');
const { ALLOWED_FRANCHISE_MARKUP_PERCENTS } = require('../../utils/franchisePrice.utils');

const updateFranchiseSettingsValidator = [
  body('franchise_markup_percent')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('franchise_markup_percent must be an integer')
    .custom((value) => {
      if (value == null) return true;
      if (!ALLOWED_FRANCHISE_MARKUP_PERCENTS.includes(Number(value))) {
        throw new Error(
          `franchise_markup_percent must be one of: ${ALLOWED_FRANCHISE_MARKUP_PERCENTS.join(', ')}`
        );
      }
      return true;
    }),
];

const updateOnlineStockSettingsValidator = [
  body('online_warehouse_id')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error('online_warehouse_id must be a warehouse id string or null');
      }
      return true;
    }),
];

module.exports = {
  updateFranchiseSettingsValidator,
  updateOnlineStockSettingsValidator,
};
