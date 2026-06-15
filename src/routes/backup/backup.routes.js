const express = require('express');
const multer = require('multer');
const router = express.Router();

const BackupController = require('../../controllers/backup/backup.controller');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { validateRequest } = require('../../middlewares/validation.middleware');
const config = require('../../config/index.config');
const {
  updateSettingsValidator,
  createBackupValidator,
  backupIdParamValidator,
  listHistoryValidator,
  restoreDriveValidator,
  restoreUploadValidator,
} = require('../../validators/backup/backup.validators');
const { BACKUP_ACCESS_ROLES } = require('../../services/backup/backup.constants');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.BACKUP_MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      return cb(new Error('Only .zip backup files are allowed'));
    }
    cb(null, true);
  },
});

router.get('/google/callback', BackupController.googleCallback);

router.use(requireAuth);
router.use(authorizeRoles(...BACKUP_ACCESS_ROLES));

router.get('/settings', BackupController.getSettings);
router.put('/settings', updateSettingsValidator, validateRequest, BackupController.updateSettings);
router.get('/stats', BackupController.getStats);
router.get('/history', listHistoryValidator, validateRequest, BackupController.listHistory);
router.get('/restore-history', listHistoryValidator, validateRequest, BackupController.listRestoreHistory);

router.post('/create', createBackupValidator, validateRequest, BackupController.createBackup);

router.get('/google/connect-url', BackupController.googleConnectUrl);
router.get('/google/status', BackupController.googleStatus);
router.post('/google/disconnect', BackupController.googleDisconnect);

router.post(
  '/restore/upload',
  upload.single('file'),
  restoreUploadValidator,
  validateRequest,
  BackupController.restoreUpload
);
router.post('/restore/drive', restoreDriveValidator, validateRequest, BackupController.restoreFromDrive);

router.get('/:backupId/download', backupIdParamValidator, validateRequest, BackupController.downloadBackup);
router.delete('/:backupId', backupIdParamValidator, validateRequest, BackupController.deleteBackup);

module.exports = router;
