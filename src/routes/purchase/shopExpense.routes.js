const express = require('express');
const router = express.Router();

const ShopExpenseController = require('../../controllers/purchase/shopExpense.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  expenseIdParam,
  listShopExpensesValidator,
  createShopExpenseValidator,
  updateShopExpenseValidator,
} = require('../../validators/purchase/shopExpense.validators');

const READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER'];
const WRITE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER'];

router.use(requireAuth);

router.get('/', authorizeRoles(...READ_ROLES), listShopExpensesValidator, validateRequest, ShopExpenseController.list);
router.post('/', authorizeRoles(...WRITE_ROLES), createShopExpenseValidator, validateRequest, ShopExpenseController.create);
router.put('/:expenseId', authorizeRoles(...WRITE_ROLES), updateShopExpenseValidator, validateRequest, ShopExpenseController.update);
router.patch('/:expenseId/cancel', authorizeRoles(...WRITE_ROLES), expenseIdParam, validateRequest, ShopExpenseController.cancel);

module.exports = router;
