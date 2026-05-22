const express = require('express');
const router = express.Router();
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const PurchaseEntryController = require('../../controllers/purchase/purchaseEntry.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];

router.get('/', requireAuth, authorizeRoles(...READ_ROLES), PurchaseEntryController.list);
router.get('/:purchaseId', requireAuth, authorizeRoles(...READ_ROLES), PurchaseEntryController.getById);

module.exports = router;