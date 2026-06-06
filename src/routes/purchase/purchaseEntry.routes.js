const express = require('express');
const router = express.Router();

const PurchaseEntryController = require('../../controllers/purchase/purchaseEntry.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  purchaseIdParam,
  listPurchaseEntriesValidator,
} = require('../../validators/purchase/purchaseEntry.validators');
const { performanceValidator } = require('../../validators/purchase/vendorPayment.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];

router.use(requireAuth);

router.get('/', authorizeRoles(...READ_ROLES), listPurchaseEntriesValidator, validateRequest, PurchaseEntryController.list);

router.get(
  '/summary/vendor',
  authorizeRoles('SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'),
  PurchaseEntryController.vendorSummary
);

router.get(
  '/performance',
  authorizeRoles(...READ_ROLES),
  performanceValidator,
  validateRequest,
  PurchaseEntryController.performance
);

router.get(
  '/:purchaseId/pdf',
  authorizeRoles(...READ_ROLES),
  purchaseIdParam,
  validateRequest,
  PurchaseEntryController.downloadPdf
);

router.get('/:purchaseId', authorizeRoles(...READ_ROLES), purchaseIdParam, validateRequest, PurchaseEntryController.getById);

module.exports = router;
