const express = require('express');
const router = express.Router();

require('../../services/sync/registerSyncHandlers').registerSyncHandlers();

const SyncController = require('../../controllers/sync/sync.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  pullSyncValidator,
  pushSyncValidator,
  statusSyncValidator,
} = require('../../validators/sync/sync.validators');
const { OFFLINE_SYNC_ROLES } = require('../../services/sync/sync.constants');

router.use(requireAuth);
router.use(authorizeRoles(...OFFLINE_SYNC_ROLES));

router.get('/pull', pullSyncValidator, validateRequest, SyncController.pull);
router.post('/push', pushSyncValidator, validateRequest, SyncController.push);
router.get('/status', statusSyncValidator, validateRequest, SyncController.status);

module.exports = router;
