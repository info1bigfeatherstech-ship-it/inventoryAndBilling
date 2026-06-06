const express = require('express');
const router = express.Router();

const VendorPaymentController = require('../../controllers/purchase/vendorPayment.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  paymentIdParam,
  listPaymentsValidator,
  payablePurchasesValidator,
  createPaymentValidator,
  updatePaymentStatusValidator,
} = require('../../validators/purchase/vendorPayment.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const WRITE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER'];

router.use(requireAuth);

router.get('/payable-purchases', authorizeRoles(...READ_ROLES), payablePurchasesValidator, validateRequest, VendorPaymentController.payablePurchases);
router.get('/', authorizeRoles(...READ_ROLES), listPaymentsValidator, validateRequest, VendorPaymentController.list);
router.post('/', authorizeRoles(...WRITE_ROLES), createPaymentValidator, validateRequest, VendorPaymentController.create);
router.patch('/:paymentId/status', authorizeRoles(...WRITE_ROLES), updatePaymentStatusValidator, validateRequest, VendorPaymentController.updateStatus);
router.patch('/:paymentId/cancel', authorizeRoles(...WRITE_ROLES), paymentIdParam, validateRequest, VendorPaymentController.cancel);

module.exports = router;
