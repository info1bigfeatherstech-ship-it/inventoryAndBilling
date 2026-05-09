const { body, param, query } = require('express-validator');

const BUSINESS_TYPES = ['RETAILER', 'WHOLESALER', 'IMPORTER', 'EXPORTER', 'DISTRIBUTOR'];

const normalizePhone = (value) => String(value || '').replace(/[^\d]/g, '');
const normalizeGstin = (value) => {
  const normalized = String(value || '').replace(/\s+/g, '').toUpperCase();
  return normalized === '' ? null : normalized;
};

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

const vendorIdParam = [
  param('vendorId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('vendorId is required'),
];

const createVendorValidator = [
  body('company_name')
    .isString()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('company_name must be 2-200 characters'),

  body('phone')
    .customSanitizer(normalizePhone)
    .isLength({ min: 10, max: 10 })
    .withMessage('phone must be a 10-digit number'),

  body('supply_city')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('supply_city is required'),

  body('business_type')
    .isIn(BUSINESS_TYPES)
    .withMessage(`business_type must be one of: ${BUSINESS_TYPES.join(', ')}`),

  body('city')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('city is required'),

  body('contact_person').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('whatsapp')
    .optional({ nullable: true })
    .customSanitizer(normalizePhone)
    .custom((v) => v === '' || v.length === 10)
    .withMessage('whatsapp must be a 10-digit number'),
  body('email').optional({ nullable: true }).isEmail().withMessage('email must be valid'),
  body('gst_number')
    .optional({ nullable: true })
    .customSanitizer(normalizeGstin)
    .optional({ nullable: true })
    .matches(gstinRegex)
    .withMessage('gst_number must be a valid GSTIN'),
  body('vendor_type').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('address').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateVendorValidator = [
  ...vendorIdParam,

  body('company_name').optional().isString().trim().isLength({ min: 2, max: 200 }),
  body('phone')
    .optional()
    .customSanitizer(normalizePhone)
    .isLength({ min: 10, max: 10 })
    .withMessage('phone must be a 10-digit number'),
  body('supply_city').optional().isString().trim().notEmpty(),
  body('business_type').optional().isIn(BUSINESS_TYPES),
  body('city').optional().isString().trim().notEmpty(),
  body('contact_person').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('whatsapp')
    .optional({ nullable: true })
    .customSanitizer(normalizePhone)
    .custom((v) => v === '' || v.length === 10)
    .withMessage('whatsapp must be a 10-digit number'),
  body('email').optional({ nullable: true }).isEmail(),
  body('gst_number')
    .optional({ nullable: true })
    .customSanitizer(normalizeGstin)
    .optional({ nullable: true })
    .matches(gstinRegex)
    .withMessage('gst_number must be a valid GSTIN'),
  body('vendor_type').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('address').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('is_active').optional().isBoolean().toBoolean(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const listVendorsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
  query('business_type').optional().isIn(BUSINESS_TYPES),
  query('city').optional().isString().trim().isLength({ min: 1, max: 100 }),
  query('is_active').optional().isBoolean().toBoolean(),
];

module.exports = {
  BUSINESS_TYPES,
  vendorIdParam,
  createVendorValidator,
  updateVendorValidator,
  listVendorsValidator,
};
