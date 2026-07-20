const express = require('express');
const router = express.Router();

const AppSettingsController = require('../../controllers/settings/appSettings.controller');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  updateFranchiseSettingsValidator,
  updateOnlineStockSettingsValidator,
} = require('../../validators/settings/appSettings.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_OWNER', 'SHOP_MANAGER'];

router.use(requireAuth);

router.get(
  '/franchise',
  authorizeRoles(...READ_ROLES),
  AppSettingsController.getFranchiseSettings
);

router.put(
  '/franchise',
  authorizeRoles('SUPER_ADMIN'),
  updateFranchiseSettingsValidator,
  validateRequest,
  AppSettingsController.updateFranchiseSettings
);

router.get(
  '/online-stock',
  authorizeRoles('SUPER_ADMIN'),
  AppSettingsController.getOnlineStockSettings
);

router.put(
  '/online-stock',
  authorizeRoles('SUPER_ADMIN'),
  updateOnlineStockSettingsValidator,
  validateRequest,
  AppSettingsController.updateOnlineStockSettings
);

module.exports = router;
