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

const updateCompanyInvoiceSettingsValidator = [
  body('transfer_invoice_legal_name').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('transfer_invoice_gstin')
    .optional({ nullable: true })
    .isString()
    .trim()
    .custom((value) => {
      if (value == null || value === '') return true;
      const g = String(value).trim().toUpperCase();
      if (!/^[0-9A-Z]{15}$/.test(g)) {
        throw new Error('transfer_invoice_gstin must be a valid 15-character GSTIN');
      }
      return true;
    }),
  body('transfer_invoice_state_code')
    .optional({ nullable: true })
    .isString()
    .trim()
    .custom((value) => {
      if (value == null || value === '') return true;
      if (!/^\d{2}$/.test(String(value).trim())) {
        throw new Error('transfer_invoice_state_code must be a 2-digit GST state code');
      }
      return true;
    }),
  body('transfer_invoice_address').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('transfer_invoice_city').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('transfer_invoice_phone').optional({ nullable: true }).isString().trim().isLength({ max: 30 }),
  body('transfer_invoice_email')
    .optional({ nullable: true })
    .isString()
    .trim()
    .custom((value) => {
      if (value == null || value === '') return true;
      const email = String(value).trim();
      if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('transfer_invoice_email must be a valid email address');
      }
      return true;
    }),
];

module.exports = {
  updateFranchiseSettingsValidator,
  updateOnlineStockSettingsValidator,
  updateCompanyInvoiceSettingsValidator,
};
