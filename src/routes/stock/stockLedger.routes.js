const express = require('express');
const router = express.Router();

const StockLedgerController = require('../../controllers/stock/stockLedger.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  listLedgerValidator,
  variantIdParam,
  warehouseIdParam,
  shopIdParam,
  dateRangeQuery,
} = require('../../validators/stock/stockLedger.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_OWNER', 'SHOP_STOCK_LISTER', 'BILLING_STAFF'];

router.use(requireAuth);

router.get('/export', authorizeRoles(...READ_ROLES), listLedgerValidator, validateRequest, StockLedgerController.exportCsv);

router.get('/', authorizeRoles(...READ_ROLES), listLedgerValidator, validateRequest, StockLedgerController.list);
router.get(
  '/variant/:variantId',
  authorizeRoles(...READ_ROLES),
  variantIdParam,
  dateRangeQuery,
  validateRequest,
  StockLedgerController.byVariant
);
router.get(
  '/warehouse/:warehouseId',
  authorizeRoles(...READ_ROLES),
  warehouseIdParam,
  dateRangeQuery,
  validateRequest,
  StockLedgerController.byWarehouse
);
router.get(
  '/shop/:shopId',
  authorizeRoles(...READ_ROLES),
  shopIdParam,
  dateRangeQuery,
  validateRequest,
  StockLedgerController.byShop
);

module.exports = router;
