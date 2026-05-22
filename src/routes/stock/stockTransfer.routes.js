const express = require('express');
const router = express.Router();

const StockTransferController = require('../../controllers/stock/stockTransfer.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { idempotency } = require('../../middlewares/idempotency.middleware');
const {
  whToShopValidator,
  whToWhValidator,
  shopToShopValidator,
  reconcileValidator,
} = require('../../validators/stock/stockTransfer.validators');

const WH_WRITE = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const SHOP_TRANSFER = ['SUPER_ADMIN', 'SHOP_OWNER'];
const ADMIN_ONLY = ['SUPER_ADMIN'];

const idem24h = idempotency({ ttlSeconds: 86400 });

router.use(requireAuth);

router.post(
  '/transfer/wh-to-shop',
  authorizeRoles(...WH_WRITE),
  idem24h,
  whToShopValidator,
  validateRequest,
  StockTransferController.whToShop
);

router.post(
  '/transfer/wh-to-wh',
  authorizeRoles(...WH_WRITE),
  idem24h,
  whToWhValidator,
  validateRequest,
  StockTransferController.whToWh
);

router.post(
  '/transfer/shop-to-shop',
  authorizeRoles(...SHOP_TRANSFER),
  idem24h,
  shopToShopValidator,
  validateRequest,
  StockTransferController.shopToShop
);

router.post(
  '/reconcile',
  authorizeRoles(...ADMIN_ONLY),
  reconcileValidator,
  validateRequest,
  StockTransferController.reconcile
);

module.exports = router;
