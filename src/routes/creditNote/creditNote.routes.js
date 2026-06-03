const express = require('express');
const router = express.Router();

const CreditNoteController = require('../../controllers/creditNote/creditNote.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { idempotency } = require('../../middlewares/idempotency.middleware');
const {
  creditNoteIdParam,
  createCreditNoteValidator,
  listCreditNotesValidator,
  lookupCreditNoteValidator,
  redeemCreditNoteValidator,
  refundCreditNoteValidator,
  cancelCreditNoteValidator,
} = require('../../validators/creditNote/creditNote.validators');

const READ_ROLES = [
  'SUPER_ADMIN',
  'SHOP_OWNER',
  'BILLING_STAFF',
  'SHOP_STOCK_LISTER',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
];
const WRITE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'BILLING_STAFF'];
const ADMIN_ONLY = ['SUPER_ADMIN'];

const idem24h = idempotency({ ttlSeconds: 86400 });

router.use(requireAuth);

router.post(
  '/',
  authorizeRoles(...WRITE_ROLES),
  idem24h,
  createCreditNoteValidator,
  validateRequest,
  CreditNoteController.create
);

router.get(
  '/',
  authorizeRoles(...READ_ROLES),
  listCreditNotesValidator,
  validateRequest,
  CreditNoteController.list
);

router.get(
  '/lookup',
  authorizeRoles(...READ_ROLES),
  lookupCreditNoteValidator,
  validateRequest,
  CreditNoteController.lookup
);

router.get(
  '/:creditNoteId',
  authorizeRoles(...READ_ROLES),
  creditNoteIdParam,
  validateRequest,
  CreditNoteController.getById
);

router.patch(
  '/:creditNoteId/redeem',
  authorizeRoles(...WRITE_ROLES),
  idem24h,
  redeemCreditNoteValidator,
  validateRequest,
  CreditNoteController.redeem
);

router.post(
  '/:creditNoteId/refund',
  authorizeRoles(...WRITE_ROLES),
  idem24h,
  refundCreditNoteValidator,
  validateRequest,
  CreditNoteController.refund
);

router.patch(
  '/:creditNoteId/cancel',
  authorizeRoles(...ADMIN_ONLY),
  idem24h,
  cancelCreditNoteValidator,
  validateRequest,
  CreditNoteController.cancel
);

module.exports = router;
