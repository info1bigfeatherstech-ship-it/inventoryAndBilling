const express = require('express');
const router = express.Router();

const ShopController = require('../../controllers/shop/shop.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  shopIdParam,
  createShopValidator,
  updateShopValidator,
  listShopsValidator,
} = require('../../validators/shop/shop.validators');

const ADMIN_ONLY = ['SUPER_ADMIN'];
const SHOP_READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_STOCK_LISTER', 'BILLING_STAFF', 'WH_MANAGER', 'WH_STOCK_LISTER'];

router.use(requireAuth);

router.get('/', authorizeRoles(...SHOP_READ_ROLES), listShopsValidator, validateRequest, ShopController.list);
router.get('/:shopId', authorizeRoles(...SHOP_READ_ROLES), shopIdParam, validateRequest, ShopController.getById);

router.post('/', authorizeRoles(...ADMIN_ONLY), createShopValidator, validateRequest, ShopController.create);
router.put('/:shopId', authorizeRoles(...ADMIN_ONLY), updateShopValidator, validateRequest, ShopController.update);
router.delete('/:shopId', authorizeRoles(...ADMIN_ONLY), shopIdParam, validateRequest, ShopController.remove);

module.exports = router;
