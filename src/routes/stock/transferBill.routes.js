const express = require('express');
const router = express.Router();

const TransferBillController = require('../../controllers/stock/transferBill.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { createRateLimiter, RL_KEY_PREFIX } = require('../../middlewares/rateLimiter.middleware');
const {
  listTransferBillsValidator,
  transferBillSourceParam,
} = require('../../validators/stock/transferBill.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_OWNER', 'SHOP_MANAGER'];

const publicTransferBillLimiter = createRateLimiter({
  max: 30,
  windowMs: 15 * 60 * 1000,
  keyPrefix: `${RL_KEY_PREFIX}:public-transfer-bill`,
});

router.get('/public/:token', publicTransferBillLimiter, TransferBillController.getPublicTransferBillPdf);

router.use(requireAuth);

router.get(
  '/summary',
  authorizeRoles(...READ_ROLES),
  listTransferBillsValidator,
  validateRequest,
  TransferBillController.summary
);

router.get(
  '/',
  authorizeRoles(...READ_ROLES),
  listTransferBillsValidator,
  validateRequest,
  TransferBillController.list
);

router.get(
  '/:source/:id/pdf',
  authorizeRoles(...READ_ROLES),
  transferBillSourceParam,
  validateRequest,
  TransferBillController.downloadPdf
);

router.get(
  '/:source/:id',
  authorizeRoles(...READ_ROLES),
  transferBillSourceParam,
  validateRequest,
  TransferBillController.getById
);

module.exports = router;
