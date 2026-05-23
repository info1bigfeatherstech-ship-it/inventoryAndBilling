const { body, param, query } = require('express-validator');

const USER_ROLES = [
  'SUPER_ADMIN',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
  'SHOP_OWNER',
  'BILLING_STAFF',
  'SHOP_STOCK_LISTER',
];

const WAREHOUSE_ROLES = ['WH_MANAGER', 'WH_STOCK_LISTER'];
const SHOP_ROLES = ['SHOP_OWNER', 'BILLING_STAFF', 'SHOP_STOCK_LISTER'];

const normalizePhone = (value) => String(value || '').replace(/[^\d]/g, '');


const validateRoleAssignments = (value, { req }) => {
  const role = req.body.role;
  const hasWarehouse = Object.prototype.hasOwnProperty.call(req.body, 'warehouse_id')
    && req.body.warehouse_id !== null
    && String(req.body.warehouse_id).trim() !== '';
  const hasShop = Object.prototype.hasOwnProperty.call(req.body, 'shop_id')
    && req.body.shop_id !== null
    && String(req.body.shop_id).trim() !== '';

  if (WAREHOUSE_ROLES.includes(role)) {
    if (!hasWarehouse) throw new Error(`${role} requires warehouse_id`);
    if (hasShop) throw new Error(`${role} cannot be assigned to shop_id`);
  }

  if (SHOP_ROLES.includes(role)) {
    // ✅ FIXED: Allow SHOP_OWNER to be created without shop_id
    // Only validate that if shop_id is provided, it's not also assigned to warehouse
    if (hasWarehouse) {
      throw new Error(`${role} cannot be assigned to warehouse_id`);
    }
    // ⭐ Removed the mandatory shop_id check
  }

  if (role === 'SUPER_ADMIN' && (hasWarehouse || hasShop)) {
    throw new Error('SUPER_ADMIN cannot have warehouse_id or shop_id');
  }

  return true;
};




const userIdParam = [
  param('userId').isString().trim().notEmpty().withMessage('userId is required'),
];

const createUserValidator = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('name must be 2-120 characters'),
  body('phone')
    .customSanitizer(normalizePhone)
    .isLength({ min: 10, max: 10 })
    .withMessage('phone must be a 10-digit number'),
  body('password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('password must be 8-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .withMessage('password must include upper, lower, number and special character'),
  body('role').isIn(USER_ROLES).withMessage(`role must be one of: ${USER_ROLES.join(', ')}`),
  body('warehouse_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('shop_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body().custom(validateRoleAssignments),
];

const updateUserValidator = [
  ...userIdParam,
  body('name').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('phone')
    .optional()
    .customSanitizer(normalizePhone)
    .isLength({ min: 10, max: 10 })
    .withMessage('phone must be a 10-digit number'),
  body('role').optional().isIn(USER_ROLES),
  body('warehouse_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('shop_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateUserStatusValidator = [
  ...userIdParam,
  body('is_active').isBoolean().withMessage('is_active must be boolean'),
];

const resetPasswordValidator = [
  ...userIdParam,
  body('new_password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('new_password must be 8-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .withMessage('new_password must include upper, lower, number and special character'),
];

const listUsersValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
  query('role').optional().isIn(USER_ROLES),
  query('warehouse_id').optional().isString().trim().notEmpty(),
  query('shop_id').optional().isString().trim().notEmpty(),
  query('is_active').optional().isBoolean().toBoolean(),
];

module.exports = {
  USER_ROLES,
  WAREHOUSE_ROLES,
  SHOP_ROLES,
  userIdParam,
  createUserValidator,
  updateUserValidator,
  updateUserStatusValidator,
  resetPasswordValidator,
  listUsersValidator,
};
