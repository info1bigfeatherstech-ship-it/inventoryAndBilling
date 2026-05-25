const express = require('express');
const router = express.Router();

const BulkTransferController = require('../../controllers/stock/bulkTransfer.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { idempotency } = require('../../middlewares/idempotency.middleware');
const {
  bulkRequestIdParam,
  createBulkValidator,
  listBulkValidator,
  approveBulkValidator,
  dispatchBulkValidator,
  receiveBulkValidator,
  cancelBulkValidator,
} = require('../../validators/stock/bulkTransfer.validators');

const READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_STOCK_LISTER'];
const CREATE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER'];
const APPROVE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER'];
const DISPATCH_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const RECEIVE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER'];

const idem24h = idempotency({ ttlSeconds: 86400 });

router.use(requireAuth);

router.post(
  '/',
  authorizeRoles(...CREATE_ROLES),
  idem24h,
  createBulkValidator,
  validateRequest,
  BulkTransferController.create
);

router.get(
  '/',
  authorizeRoles(...READ_ROLES),
  listBulkValidator,
  validateRequest,
  BulkTransferController.list
);

router.get(
  '/:bulkRequestId',
  authorizeRoles(...READ_ROLES),
  bulkRequestIdParam,
  validateRequest,
  BulkTransferController.getById
);

router.patch(
  '/:bulkRequestId/approve',
  authorizeRoles(...APPROVE_ROLES),
  idem24h,
  approveBulkValidator,
  validateRequest,
  BulkTransferController.approve
);

router.patch(
  '/:bulkRequestId/dispatch',
  authorizeRoles(...DISPATCH_ROLES),
  idem24h,
  dispatchBulkValidator,
  validateRequest,
  BulkTransferController.dispatch
);

router.patch(
  '/:bulkRequestId/receive',
  authorizeRoles(...RECEIVE_ROLES),
  idem24h,
  receiveBulkValidator,
  validateRequest,
  BulkTransferController.receive
);

router.patch(
  '/:bulkRequestId/cancel',
  authorizeRoles(...CREATE_ROLES, ...['WH_MANAGER']),
  idem24h,
  cancelBulkValidator,
  validateRequest,
  BulkTransferController.cancel
);

module.exports = router;
