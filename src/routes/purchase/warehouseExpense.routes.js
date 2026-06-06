const express = require('express');
const router = express.Router();

const WarehouseExpenseController = require('../../controllers/purchase/warehouseExpense.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  expenseIdParam,
  listExpensesValidator,
  createExpenseValidator,
  updateExpenseValidator,
} = require('../../validators/purchase/warehouseExpense.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const WRITE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER'];

router.use(requireAuth);

router.get('/', authorizeRoles(...READ_ROLES), listExpensesValidator, validateRequest, WarehouseExpenseController.list);
router.post('/', authorizeRoles(...WRITE_ROLES), createExpenseValidator, validateRequest, WarehouseExpenseController.create);
router.put('/:expenseId', authorizeRoles(...WRITE_ROLES), updateExpenseValidator, validateRequest, WarehouseExpenseController.update);
router.patch('/:expenseId/cancel', authorizeRoles(...WRITE_ROLES), expenseIdParam, validateRequest, WarehouseExpenseController.cancel);

module.exports = router;
