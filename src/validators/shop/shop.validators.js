const { body, param, query } = require('express-validator');
const { SHOP_CODE_PATTERN, SHOP_CODE_FORMAT_HINT } = require('../../constants/shop.constants');

const shopIdParam = [param('shopId').isString().trim().notEmpty()];

const GSTIN_BODY_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

const createShopValidator = [
  body('shop_code')
    .isString()
    .trim()
    .custom((v) => {
      const code = String(v).trim().toUpperCase();
      if (!SHOP_CODE_PATTERN.test(code)) {
        throw new Error(`shop_code must be ${SHOP_CODE_FORMAT_HINT}`);
      }
      return true;
    }),
  body('shop_name').isString().trim().isLength({ min: 2, max: 100 }),
  body('address').isString().trim().isLength({ min: 2, max: 300 }),
  body('city').isString().trim().isLength({ min: 2, max: 50 }),
  body('pincode')
    .optional({ nullable: true })
    .matches(/^\d{6}$/)
    .withMessage('pincode must be a 6-digit number'),
  body('state_code')
    .notEmpty()
    .withMessage('state_code is required')
    .matches(/^\d{2}$/)
    .withMessage('state_code must be 2 digits (e.g. 07 for Delhi, 27 for Maharashtra)'),
  body('phone').isString().trim().matches(/^[0-9]{10}$/).withMessage('phone must be a 10-digit number'),
  body('email').optional({ nullable: true }).isEmail(),
  body('owner_user_id')
    .optional({ nullable: true })
    .isString()
    .trim()
    .notEmpty()
    .withMessage('owner_user_id must be a valid user ID if provided'),
  body('shop_type')
    .optional()
    .isIn(['OWNER', 'FRANCHISE'])
    .withMessage('shop_type must be OWNER or FRANCHISE'),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('sales_channels')
  .optional()
  .isArray()
  .withMessage('sales_channels must be an array'),
body('sales_channels.*')
  .optional()
  .isIn(['WALK_IN', 'ONLINE', 'WHOLESALE', 'MHM', 'OWB', 'OTHER'])
  .withMessage('Invalid sales channel'),
  body('gst_number')
    .optional({ nullable: true })
    .isString()
    .trim()
    .custom((v) => {
      if (v == null || String(v).trim() === '') return true;
      const gst = String(v).trim().toUpperCase();
      if (!GSTIN_BODY_RE.test(gst)) {
        throw new Error('gst_number must be a valid 15-character GSTIN');
      }
      return true;
    }),
];

const updateShopValidator = [
  ...shopIdParam,
  body('shop_name').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('address').optional().isString().trim().isLength({ min: 2, max: 300 }),
  body('city').optional().isString().trim().isLength({ min: 2, max: 50 }),
  body('pincode').optional({ nullable: true }).matches(/^\d{6}$/),
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
  body('shop_type')
    .optional()
    .isIn(['OWNER', 'FRANCHISE'])
    .withMessage('shop_type must be OWNER or FRANCHISE'),
  
  body('sales_channels')
    .optional()
    .isArray()
    .withMessage('sales_channels must be an array'),
  body('sales_channels.*')
    .optional()
    .isIn(['WALK_IN', 'ONLINE', 'WHOLESALE', 'MHM', 'OWB', 'OTHER'])
    .withMessage('Invalid sales channel'),
  body('gst_number')
    .optional({ nullable: true })
    .isString()
    .trim()
    .custom((v) => {
      if (v == null || String(v).trim() === '') return true;
      const gst = String(v).trim().toUpperCase();
      if (!GSTIN_BODY_RE.test(gst)) {
        throw new Error('gst_number must be a valid 15-character GSTIN');
      }
      return true;
    }),
];

const updateMyShopValidator = [
  body('address').optional().isString().trim().isLength({ min: 2, max: 300 }),
  body('city').optional().isString().trim().isLength({ min: 2, max: 50 }),
  body('pincode').optional({ nullable: true }).matches(/^\d{6}$/),
  body('phone').optional().isString().trim().matches(/^[0-9]{10}$/),
  body('email').optional({ nullable: true }).isEmail(),
  body('gst_number')
    .optional({ nullable: true })
    .isString()
    .trim()
    .custom((v) => {
      if (v == null || String(v).trim() === '') return true;
      const gst = String(v).trim().toUpperCase();
      if (!GSTIN_BODY_RE.test(gst)) {
        throw new Error('gst_number must be a valid 15-character GSTIN');
      }
      return true;
    }),
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
  updateMyShopValidator,
  listShopsValidator,
};
