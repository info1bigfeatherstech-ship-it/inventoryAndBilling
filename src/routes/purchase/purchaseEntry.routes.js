const express = require('express');
const router = express.Router();

const PurchaseEntryController = require('../../controllers/purchase/purchaseEntry.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  purchaseIdParam,
  listPurchaseEntriesValidator,
} = require('../../validators/purchase/purchaseEntry.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];

router.use(requireAuth);

// List purchase entries
router.get('/',authorizeRoles(...READ_ROLES),listPurchaseEntriesValidator,validateRequest,PurchaseEntryController.list);

// Get single purchase entry
router.get( '/:purchaseId', authorizeRoles(...READ_ROLES), purchaseIdParam, validateRequest, PurchaseEntryController.getById);

// Vendor summary (for reports)
router.get('/summary/vendor', authorizeRoles('SUPER_ADMIN', 'WH_MANAGER'), PurchaseEntryController.vendorSummary);

module.exports = router;