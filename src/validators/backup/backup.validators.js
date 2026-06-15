const { body, param, query } = require('express-validator');
const { RESTORE_MODE } = require('../../services/backup/backup.constants');

const updateSettingsValidator = [
  body('auto_backup_enabled').optional().isBoolean(),
  body('auto_backup_frequency').optional().isIn(['DAILY', 'WEEKLY', 'MONTHLY']),
  body('auto_backup_time').optional().matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  body('retention_days').optional().isInt({ min: 7, max: 365 }),
  body('auto_delete_old_backups').optional().isBoolean(),
  body('email_on_success').optional().isBoolean(),
  body('email_on_failure').optional().isBoolean(),
  body('email_on_late').optional().isBoolean(),
  body('include_bills').optional().isBoolean(),
  body('include_customers').optional().isBoolean(),
  body('include_products').optional().isBoolean(),
  body('include_stock').optional().isBoolean(),
  body('include_staff_codes').optional().isBoolean(),
  body('include_settings').optional().isBoolean(),
  body('compression_level').optional().isIn(['MAXIMUM', 'NORMAL', 'FAST']),
  body('encrypt_backup').optional().isBoolean(),
];

const createBackupValidator = [
  body('destination').optional().isIn(['computer', 'drive']),
];

const backupIdParamValidator = [
  param('backupId').isString().trim().notEmpty(),
];

const listHistoryValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('backup_type').optional().isIn(['AUTO', 'MANUAL_COMPUTER', 'MANUAL_DRIVE']),
];

const restoreDriveValidator = [
  body('backup_id').isString().trim().notEmpty(),
  body('mode').optional().isIn(Object.values(RESTORE_MODE)),
];

const restoreUploadValidator = [
  body('mode').optional().isIn(Object.values(RESTORE_MODE)),
];

module.exports = {
  updateSettingsValidator,
  createBackupValidator,
  backupIdParamValidator,
  listHistoryValidator,
  restoreDriveValidator,
  restoreUploadValidator,
};
