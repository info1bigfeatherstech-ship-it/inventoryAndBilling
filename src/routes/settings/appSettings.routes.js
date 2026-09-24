const express = require('express');
const router = express.Router();

const AppSettingsController = require('../../controllers/settings/appSettings.controller');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  updateFranchiseSettingsValidator,
  updateWholesaleSettingsValidator,
  updateOnlineStockSettingsValidator,
  updateCompanyInvoiceSettingsValidator,
} = require('../../validators/settings/appSettings.validators');

const READ_ROLES = ['SUPER_ADMIN', 'ORG_MANAGER', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_OWNER', 'SHOP_MANAGER'];
const WHOLESALE_READ_ROLES = [...READ_ROLES, 'BILLING_STAFF'];
/** Billing staff need franchise markup to enforce F.Price floor on the counter. */
const FRANCHISE_READ_ROLES = [...READ_ROLES, 'BILLING_STAFF'];

router.use(requireAuth);

router.get(
  '/franchise',
  authorizeRoles(...FRANCHISE_READ_ROLES),
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
  '/wholesale',
  authorizeRoles(...WHOLESALE_READ_ROLES),
  AppSettingsController.getWholesaleSettings
);

router.put(
  '/wholesale',
  authorizeRoles('SUPER_ADMIN'),
  updateWholesaleSettingsValidator,
  validateRequest,
  AppSettingsController.updateWholesaleSettings
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

router.get(
  '/company',
  authorizeRoles('SUPER_ADMIN'),
  AppSettingsController.getCompanyInvoiceSettings
);

router.put(
  '/company',
  authorizeRoles('SUPER_ADMIN'),
  updateCompanyInvoiceSettingsValidator,
  validateRequest,
  AppSettingsController.updateCompanyInvoiceSettings
);

module.exports = router;
