const express = require('express');
const router = express.Router();

const TransferHistoryController = require('../../controllers/stock/transferHistory.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { listTransferHistoryValidator } = require('../../validators/stock/transferHistory.validators');

const READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_MANAGER'];

router.use(requireAuth);

router.get(
  '/',
  authorizeRoles(...READ_ROLES),
  listTransferHistoryValidator,
  validateRequest,
  TransferHistoryController.list
);

module.exports = router;
