const express = require('express');
const router = express.Router();

const ShopController = require('../../controllers/shop/shop.controller');
const ShopBankAccountController = require('../../controllers/shop/shopBankAccount.controller');
const ShopWarehouseCatalogController = require('../../controllers/stock/shopWarehouseCatalog.controller');
const { warehouseStockCatalogValidator } = require('../../validators/stock/shopWarehouseCatalog.validators');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  shopIdParam,
  createShopValidator,
  updateShopValidator,
  listShopsValidator,
} = require('../../validators/shop/shop.validators');
const {
  listBankAccountsValidator,
  createBankAccountValidator,
  updateBankAccountValidator,
  bankAccountIdParam,
} = require('../../validators/shop/shopBankAccount.validators');

const ADMIN_ONLY = ['SUPER_ADMIN'];
const SHOP_READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_STOCK_LISTER', 'BILLING_STAFF', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const BANK_READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'BILLING_STAFF'];
const BANK_WRITE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER'];

router.use(requireAuth);

router.get('/me', authorizeRoles('SHOP_OWNER'), ShopController.getMyShop);

router.get(
  '/:shopId/bank-accounts',
  authorizeRoles(...BANK_READ_ROLES),
  listBankAccountsValidator,
  validateRequest,
  ShopBankAccountController.list
);
router.get(
  '/:shopId/bank-accounts/:bankAccountId',
  authorizeRoles(...BANK_READ_ROLES),
  bankAccountIdParam,
  validateRequest,
  ShopBankAccountController.getById
);
router.post(
  '/:shopId/bank-accounts',
  authorizeRoles(...BANK_WRITE_ROLES),
  createBankAccountValidator,
  validateRequest,
  ShopBankAccountController.create
);
router.put(
  '/:shopId/bank-accounts/:bankAccountId',
  authorizeRoles(...BANK_WRITE_ROLES),
  updateBankAccountValidator,
  validateRequest,
  ShopBankAccountController.update
);
router.delete(
  '/:shopId/bank-accounts/:bankAccountId',
  authorizeRoles(...BANK_WRITE_ROLES),
  bankAccountIdParam,
  validateRequest,
  ShopBankAccountController.remove
);
router.get('/', authorizeRoles(...SHOP_READ_ROLES), listShopsValidator, validateRequest, ShopController.list);
router.get(
  '/:shopId/warehouse-stock-catalog',
  authorizeRoles('SUPER_ADMIN', 'SHOP_OWNER'),
  warehouseStockCatalogValidator,
  validateRequest,
  ShopWarehouseCatalogController.getCatalog
);
router.get('/:shopId', authorizeRoles(...SHOP_READ_ROLES), shopIdParam, validateRequest, ShopController.getById);
router.post('/', authorizeRoles(...ADMIN_ONLY), createShopValidator, validateRequest, ShopController.create);
router.put('/:shopId', authorizeRoles(...ADMIN_ONLY), updateShopValidator, validateRequest, ShopController.update);
router.delete('/:shopId', authorizeRoles(...ADMIN_ONLY), shopIdParam, validateRequest, ShopController.remove);

module.exports = router;
