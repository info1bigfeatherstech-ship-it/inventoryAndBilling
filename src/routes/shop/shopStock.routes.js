const express = require('express');
const router = express.Router();

const ShopStockController = require('../../controllers/shop/shopStock.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  variantIdParam,
  listShopStocksValidator,
  updateShopStockValidator,
  bulkUpdateShopStockValidator,
} = require('../../validators/shop/shopStock.validators');

const WRITE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_STOCK_LISTER'];
const READ_ROLES = [...WRITE_ROLES, 'BILLING_STAFF', 'WH_MANAGER'];

router.use(requireAuth);

router.get('/low-stock', authorizeRoles(...READ_ROLES), listShopStocksValidator, validateRequest, ShopStockController.lowStock);
router.get('/', authorizeRoles(...READ_ROLES), listShopStocksValidator, validateRequest, ShopStockController.list);
router.get('/:variantId', authorizeRoles(...READ_ROLES), variantIdParam, listShopStocksValidator, validateRequest, ShopStockController.getByVariant);

router.patch('/bulk', authorizeRoles(...WRITE_ROLES), bulkUpdateShopStockValidator, validateRequest, ShopStockController.bulkUpdate);
router.patch('/:variantId', authorizeRoles(...WRITE_ROLES), updateShopStockValidator, validateRequest, ShopStockController.update);

module.exports = router;
