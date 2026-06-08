const express = require('express');
const router = express.Router();

const VendorPaymentController = require('../../controllers/purchase/vendorPayment.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  paymentIdParam,
  purchaseIdParam,
  listPaymentsValidator,
  payablePurchasesValidator,
  createPaymentValidator,
  settlementStatusValidator,
  updatePaymentValidator,
  updatePaymentStatusValidator,
} = require('../../validators/purchase/vendorPayment.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const WRITE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER'];

router.use(requireAuth);

router.get('/payable-purchases', authorizeRoles(...READ_ROLES), payablePurchasesValidator, validateRequest, VendorPaymentController.payablePurchases);
router.get('/settlement-status', authorizeRoles(...READ_ROLES), settlementStatusValidator, validateRequest, VendorPaymentController.settlementStatus);
router.get('/by-purchase/:purchaseId', authorizeRoles(...READ_ROLES), purchaseIdParam, validateRequest, VendorPaymentController.getByPurchase);
router.get('/:paymentId', authorizeRoles(...READ_ROLES), paymentIdParam, validateRequest, VendorPaymentController.getById);
router.get('/', authorizeRoles(...READ_ROLES), listPaymentsValidator, validateRequest, VendorPaymentController.list);
router.post('/', authorizeRoles(...WRITE_ROLES), createPaymentValidator, validateRequest, VendorPaymentController.create);
router.put('/:paymentId', authorizeRoles(...WRITE_ROLES), updatePaymentValidator, validateRequest, VendorPaymentController.update);
router.patch('/:paymentId/status', authorizeRoles(...WRITE_ROLES), updatePaymentStatusValidator, validateRequest, VendorPaymentController.updateStatus);
router.patch('/:paymentId/cancel', authorizeRoles(...WRITE_ROLES), paymentIdParam, validateRequest, VendorPaymentController.cancel);

module.exports = router;
