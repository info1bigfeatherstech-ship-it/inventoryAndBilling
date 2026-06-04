const express = require('express');
const router = express.Router();

const DebitNoteController = require('../../controllers/debitNote/debitNote.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { idempotency } = require('../../middlewares/idempotency.middleware');
const {
  debitNoteIdParam,
  purchaseIdParam,
  createDebitNoteValidator,
  listDebitNotesValidator,
  cancelDebitNoteValidator,
} = require('../../validators/debitNote/debitNote.validators');

const WH_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const WH_WRITE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];
const CANCEL_ROLES = ['SUPER_ADMIN', 'WH_MANAGER'];

const idem24h = idempotency({ ttlSeconds: 86400 });

router.use(requireAuth);

router.get(
  '/purchase/:purchaseId/returnable-lines',
  authorizeRoles(...WH_ROLES),
  purchaseIdParam,
  validateRequest,
  DebitNoteController.returnableLines
);

router.post(
  '/',
  authorizeRoles(...WH_WRITE_ROLES),
  idem24h,
  createDebitNoteValidator,
  validateRequest,
  DebitNoteController.create
);

router.get(
  '/',
  authorizeRoles(...WH_ROLES),
  listDebitNotesValidator,
  validateRequest,
  DebitNoteController.list
);

router.get(
  '/:debitNoteId/pdf',
  authorizeRoles(...WH_ROLES),
  debitNoteIdParam,
  validateRequest,
  DebitNoteController.downloadPdf
);

router.get(
  '/:debitNoteId',
  authorizeRoles(...WH_ROLES),
  debitNoteIdParam,
  validateRequest,
  DebitNoteController.getById
);

router.patch(
  '/:debitNoteId/cancel',
  authorizeRoles(...CANCEL_ROLES),
  idem24h,
  cancelDebitNoteValidator,
  validateRequest,
  DebitNoteController.cancel
);

module.exports = router;
