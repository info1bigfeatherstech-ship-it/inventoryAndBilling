const { body, param, query } = require('express-validator');
const {
  SHOP_OWNER_CREATABLE_ROLES,
  WH_MANAGER_CREATABLE_ROLES,
} = require('../../utils/teamAccess.utils');

const normalizePhone = (value) => String(value || '').replace(/[^\d]/g, '');

const teamUserIdParam = [
  param('userId').isString().trim().notEmpty().withMessage('userId is required'),
];

const teamCreatableRoles = [...new Set([...SHOP_OWNER_CREATABLE_ROLES, ...WH_MANAGER_CREATABLE_ROLES])];

const listTeamValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
  query('role').optional().isString().trim(),
  query('is_active').optional().isBoolean().toBoolean(),
];

const createTeamMemberValidator = [
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
  body('role')
    .isIn(teamCreatableRoles)
    .withMessage(`role must be one of: ${teamCreatableRoles.join(', ')}`),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('shop_id').not().exists().withMessage('shop_id is assigned automatically'),
  body('warehouse_id').not().exists().withMessage('warehouse_id is assigned automatically'),
];

const updateTeamMemberValidator = [
  ...teamUserIdParam,
  body('name').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('phone')
    .optional()
    .customSanitizer(normalizePhone)
    .isLength({ min: 10, max: 10 })
    .withMessage('phone must be a 10-digit number'),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('role').not().exists().withMessage('role cannot be changed from Team Members'),
  body('shop_id').not().exists().withMessage('shop_id cannot be changed from Team Members'),
  body('warehouse_id').not().exists().withMessage('warehouse_id cannot be changed from Team Members'),
];

const updateTeamMemberStatusValidator = [
  ...teamUserIdParam,
  body('is_active').isBoolean().withMessage('is_active must be boolean'),
];

const resetTeamMemberPasswordValidator = [
  ...teamUserIdParam,
  body('new_password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('new_password must be 8-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .withMessage('new_password must include upper, lower, number and special character'),
];

module.exports = {
  listTeamValidator,
  createTeamMemberValidator,
  updateTeamMemberValidator,
  updateTeamMemberStatusValidator,
  resetTeamMemberPasswordValidator,
};
