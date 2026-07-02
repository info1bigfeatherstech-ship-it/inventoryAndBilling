const express = require('express');
const router = express.Router();

const ShopProductLevelController = require('../../controllers/stock/shopProductLevel.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  setProductLevelsValidator,
} = require('../../validators/stock/shopProductLevel.validators');

const WRITE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER'];

router.use(requireAuth);

router.post(
  '/',
  authorizeRoles(...WRITE_ROLES),
  setProductLevelsValidator,
  validateRequest,
  ShopProductLevelController.setLevels
);

module.exports = router;
