const express = require('express');
const router = express.Router();

const CashbankController = require('../../controllers/cashbank/cashbank.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  listCollectionsValidator,
  listReceivablesValidator,
  cashSummaryValidator,
  bankTransactionsValidator,
} = require('../../validators/cashbank/cashbank.validators');

const SHOP_CASH_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'BILLING_STAFF', 'SHOP_STOCK_LISTER'];

router.use(requireAuth);

router.get(
  '/shop/collections',
  authorizeRoles(...SHOP_CASH_ROLES),
  listCollectionsValidator,
  validateRequest,
  CashbankController.shopCollections
);
router.get(
  '/shop/receivables',
  authorizeRoles(...SHOP_CASH_ROLES),
  listReceivablesValidator,
  validateRequest,
  CashbankController.shopReceivables
);
router.get(
  '/shop/cash-summary',
  authorizeRoles(...SHOP_CASH_ROLES),
  cashSummaryValidator,
  validateRequest,
  CashbankController.shopCashSummary
);
router.get(
  '/shop/bank-transactions',
  authorizeRoles(...SHOP_CASH_ROLES),
  bankTransactionsValidator,
  validateRequest,
  CashbankController.shopBankTransactions
);

module.exports = router;
