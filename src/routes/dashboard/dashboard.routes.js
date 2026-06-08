const express = require('express');
const router = express.Router();

const DashboardController = require('../../controllers/dashboard/dashboard.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { monthlyOverviewValidator } = require('../../validators/dashboard/dashboard.validators');

const READ_ROLES = [
  'SUPER_ADMIN',
  'SHOP_OWNER',
  'SHOP_STOCK_LISTER',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
  'ACCOUNTANT',
  'BILLING_STAFF',
];

router.use(requireAuth);

router.get(
  '/monthly-overview',
  authorizeRoles(...READ_ROLES),
  monthlyOverviewValidator,
  validateRequest,
  DashboardController.monthlyOverview
);

module.exports = router;
