const express = require('express');
const router = express.Router();

const TransferRequestController = require('../../controllers/stock/transferRequest.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { idempotency } = require('../../middlewares/idempotency.middleware');
const {
  requestIdParam,
  createRequestValidator,
  emergencyRequestValidator,
  listRequestsValidator,
  approveRejectValidator,
  rejectValidator,
  dispatchValidator,
  receiveValidator,
  cancelValidator,
} = require('../../validators/stock/transferRequest.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_OWNER', 'SHOP_STOCK_LISTER'];

/** SHOP_OWNER: WH→Shop, Shop→Shop. WH_MANAGER: WH→WH only (enforced in service). */
const CREATE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'WH_MANAGER'];

/** WH→Shop / WH→WH: source WH_MANAGER. Shop→Shop: source SHOP_OWNER. */
const APPROVE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'SHOP_OWNER'];

/** WH→Shop / WH→WH: WH_MANAGER + WH_STOCK_LISTER. Shop→Shop: source SHOP_OWNER (enforced in service). */
const DISPATCH_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_OWNER'];

/** WH→WH: dest WH_MANAGER. WH→Shop / Shop→Shop: dest SHOP_OWNER. */
const RECEIVE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'SHOP_OWNER'];

const CANCEL_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'SHOP_OWNER'];

const idem24h = idempotency({ ttlSeconds: 86400 });

router.use(requireAuth);

router.post(
  '/',
  authorizeRoles(...CREATE_ROLES),
  idem24h,
  createRequestValidator,
  validateRequest,
  TransferRequestController.create
);

router.get(
  '/',
  authorizeRoles(...READ_ROLES),
  listRequestsValidator,
  validateRequest,
  TransferRequestController.list
);

router.get(
  '/my-requests',
  authorizeRoles(...READ_ROLES),
  listRequestsValidator,
  validateRequest,
  TransferRequestController.getMyRequests
);

router.post(
  '/emergency',
  authorizeRoles(...CREATE_ROLES),
  idem24h,
  emergencyRequestValidator,
  validateRequest,
  TransferRequestController.createEmergency
);

router.get(
  '/:requestId/challan/pdf',
  authorizeRoles(...READ_ROLES),
  requestIdParam,
  validateRequest,
  TransferRequestController.downloadChallanPdf
);

router.get(
  '/:requestId',
  authorizeRoles(...READ_ROLES),
  requestIdParam,
  validateRequest,
  TransferRequestController.getById
);

router.patch(
  '/:requestId/approve',
  authorizeRoles(...APPROVE_ROLES),
  idem24h,
  approveRejectValidator,
  validateRequest,
  TransferRequestController.approve
);

router.patch(
  '/:requestId/reject',
  authorizeRoles(...APPROVE_ROLES),
  idem24h,
  rejectValidator,
  validateRequest,
  TransferRequestController.reject
);

router.patch(
  '/:requestId/dispatch',
  authorizeRoles(...DISPATCH_ROLES),
  idem24h,
  dispatchValidator,
  validateRequest,
  TransferRequestController.dispatch
);

router.patch(
  '/:requestId/receive',
  authorizeRoles(...RECEIVE_ROLES),
  idem24h,
  receiveValidator,
  validateRequest,
  TransferRequestController.receive
);

router.patch(
  '/:requestId/cancel',
  authorizeRoles(...CANCEL_ROLES),
  idem24h,
  cancelValidator,
  validateRequest,
  TransferRequestController.cancel
);

module.exports = router;
