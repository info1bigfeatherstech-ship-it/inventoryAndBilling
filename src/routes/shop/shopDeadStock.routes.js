const express = require('express');
const router = express.Router();

const ShopDeadStockController = require('../../controllers/shop/shopDeadStock.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { query } = require('express-validator');

const READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER'];

const listValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('shop_id').optional().isString().trim().notEmpty(),
  query('search').optional().isString().trim(),
  query('from_date').optional().isISO8601(),
  query('to_date').optional().isISO8601(),
];

router.use(requireAuth);

router.get(
  '/',
  authorizeRoles(...READ_ROLES),
  listValidator,
  validateRequest,
  ShopDeadStockController.list
);

module.exports = router;
