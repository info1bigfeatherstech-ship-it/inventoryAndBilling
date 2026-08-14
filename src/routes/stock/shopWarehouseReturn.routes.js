const express = require('express');
const router = express.Router();

const ShopWarehouseReturnController = require('../../controllers/stock/shopWarehouseReturn.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { idempotency } = require('../../middlewares/idempotency.middleware');
const {
  returnIdParam,
  previewValidator,
  createValidator,
  listValidator,
  approveValidator,
  rejectValidator,
  receiveValidator,
  cancelValidator,
} = require('../../validators/stock/shopWarehouseReturn.validators');

const READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const CREATE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER'];
const APPROVE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const DISPATCH_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER'];
const RECEIVE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];

const idem24h = idempotency({ ttlSeconds: 86400 });

router.use(requireAuth);

router.get(
  '/preview',
  authorizeRoles(...CREATE_ROLES),
  previewValidator,
  validateRequest,
  ShopWarehouseReturnController.preview
);

router.post(
  '/',
  authorizeRoles(...CREATE_ROLES),
  idem24h,
  createValidator,
  validateRequest,
  ShopWarehouseReturnController.create
);

router.get(
  '/',
  authorizeRoles(...READ_ROLES),
  listValidator,
  validateRequest,
  ShopWarehouseReturnController.list
);

router.get(
  '/:returnId',
  authorizeRoles(...READ_ROLES),
  returnIdParam,
  validateRequest,
  ShopWarehouseReturnController.getById
);

router.get(
  '/:returnId/bill',
  authorizeRoles(...READ_ROLES),
  returnIdParam,
  validateRequest,
  ShopWarehouseReturnController.getBill
);

router.get(
  '/:returnId/bill/pdf',
  authorizeRoles(...READ_ROLES),
  returnIdParam,
  validateRequest,
  ShopWarehouseReturnController.downloadBillPdf
);

router.patch(
  '/:returnId/approve',
  authorizeRoles(...APPROVE_ROLES),
  idem24h,
  approveValidator,
  validateRequest,
  ShopWarehouseReturnController.approve
);

router.patch(
  '/:returnId/reject',
  authorizeRoles(...APPROVE_ROLES),
  idem24h,
  rejectValidator,
  validateRequest,
  ShopWarehouseReturnController.reject
);

router.patch(
  '/:returnId/dispatch',
  authorizeRoles(...DISPATCH_ROLES),
  idem24h,
  returnIdParam,
  validateRequest,
  ShopWarehouseReturnController.dispatch
);

router.patch(
  '/:returnId/receive',
  authorizeRoles(...RECEIVE_ROLES),
  idem24h,
  receiveValidator,
  validateRequest,
  ShopWarehouseReturnController.receive
);

router.patch(
  '/:returnId/cancel',
  authorizeRoles(...READ_ROLES),
  idem24h,
  cancelValidator,
  validateRequest,
  ShopWarehouseReturnController.cancel
);

module.exports = router;
