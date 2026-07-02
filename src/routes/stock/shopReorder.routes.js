const express = require('express');
const router = express.Router();

const ShopProductLevelController = require('../../controllers/stock/shopProductLevel.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { reorderSuggestionsValidator } = require('../../validators/stock/shopProductLevel.validators');

const READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER', 'BILLING_STAFF'];

router.use(requireAuth);

router.get(
  '/',
  authorizeRoles(...READ_ROLES),
  reorderSuggestionsValidator,
  validateRequest,
  ShopProductLevelController.reorderSuggestions
);

module.exports = router;
