const express = require('express');
const router = express.Router();
const ComboRuleController = require('../../controllers/combo/comboRule.controller');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  comboRuleIdParam,
  listComboRulesValidator,
  createComboRuleValidator,
  updateComboRuleValidator,
  setComboRuleActiveValidator,
} = require('../../validators/combo/comboRule.validators');

const ADMIN = ['SUPER_ADMIN'];
const BILLING_READ = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER', 'BILLING_STAFF', 'WH_MANAGER'];

router.use(requireAuth);

router.get(
  '/active',
  authorizeRoles(...BILLING_READ),
  ComboRuleController.listActive
);

router.get(
  '/',
  authorizeRoles(...ADMIN),
  listComboRulesValidator,
  validateRequest,
  ComboRuleController.list
);

router.get(
  '/:comboRuleId',
  authorizeRoles(...ADMIN),
  comboRuleIdParam,
  validateRequest,
  ComboRuleController.getById
);

router.post(
  '/',
  authorizeRoles(...ADMIN),
  createComboRuleValidator,
  validateRequest,
  ComboRuleController.create
);

router.patch(
  '/:comboRuleId',
  authorizeRoles(...ADMIN),
  updateComboRuleValidator,
  validateRequest,
  ComboRuleController.update
);

router.patch(
  '/:comboRuleId/active',
  authorizeRoles(...ADMIN),
  setComboRuleActiveValidator,
  validateRequest,
  ComboRuleController.setActive
);

router.delete(
  '/:comboRuleId',
  authorizeRoles(...ADMIN),
  comboRuleIdParam,
  validateRequest,
  ComboRuleController.remove
);

module.exports = router;
