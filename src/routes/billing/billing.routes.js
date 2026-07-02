const express = require('express');
const router = express.Router();

const BillingController = require('../../controllers/billing/billing.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { idempotency } = require('../../middlewares/idempotency.middleware');
const {
  billIdParam,
  createBillValidator,
  listBillsValidator,
  addPaymentValidator,
  cancelBillValidator,
  dailySummaryValidator,
  gstReportValidator,
} = require('../../validators/billing/billing.validators');

const { createRateLimiter, RL_KEY_PREFIX } = require('../../middlewares/rateLimiter.middleware');

const READ_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'SHOP_MANAGER', 'BILLING_STAFF', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const WRITE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'BILLING_STAFF'];

const idem24h = idempotency({ ttlSeconds: 86400 });

// Configure a rate limiter for downloading/viewing the public invoices
const publicInvoiceLimiter = createRateLimiter({
  max: 30, // limit to 30 requests
  windowMs: 15 * 60 * 1000, // per 15 minutes
  keyPrefix: `${RL_KEY_PREFIX}:public-invoice`,
});

// Expose public invoice endpoint (unauthenticated)
router.get('/public/:token', publicInvoiceLimiter, BillingController.getPublicPDF);

router.use(requireAuth);

router.get('/reports/daily', authorizeRoles(...READ_ROLES), dailySummaryValidator, validateRequest, BillingController.dailySummary);
router.get('/reports/gst', authorizeRoles(...READ_ROLES), gstReportValidator, validateRequest, BillingController.gstReport);

router.post('/', authorizeRoles(...WRITE_ROLES), idem24h, createBillValidator, validateRequest, BillingController.create);
router.get('/', authorizeRoles(...READ_ROLES), listBillsValidator, validateRequest, BillingController.list);

router.get('/:billId/pdf', authorizeRoles(...READ_ROLES), billIdParam, validateRequest, BillingController.downloadPDF);
router.patch('/:billId/cancel', authorizeRoles(...WRITE_ROLES), idem24h, cancelBillValidator, validateRequest, BillingController.cancel);
router.post('/:billId/payments', authorizeRoles(...WRITE_ROLES), idem24h, addPaymentValidator, validateRequest, BillingController.addPayment);
router.get('/:billId', authorizeRoles(...READ_ROLES), billIdParam, validateRequest, BillingController.getById);

module.exports = router;
