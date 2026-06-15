const asyncHandler = require('../../utils/asyncHandler.utils');
const { successResponse } = require('../../utils/response.utils');
const config = require('../../config/index.config');
const BackupService = require('../../services/backup/backup.service');
const BackupSettingsService = require('../../services/backup/backupSettings.service');
const GoogleDriveService = require('../../services/backup/googleDrive.service');
const { AppError } = require('../../errors/AppError');
const { RESTORE_MODE } = require('../../services/backup/backup.constants');

const BackupController = {
  getSettings: asyncHandler(async (req, res) => {
    const settings = await BackupSettingsService.getOrCreateSettings(req.user.userId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Backup settings fetched successfully',
      data: settings,
    });
  }),

  updateSettings: asyncHandler(async (req, res) => {
    const settings = await BackupSettingsService.updateSettings(req.user.userId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Backup settings saved successfully',
      data: settings,
    });
  }),

  getStats: asyncHandler(async (req, res) => {
    const stats = await BackupService.getStats(req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Backup stats fetched successfully',
      data: stats,
    });
  }),

  listHistory: asyncHandler(async (req, res) => {
    const data = await BackupService.listHistory(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Backup history fetched successfully',
      data: data.items,
      meta: data.pagination,
    });
  }),

  listRestoreHistory: asyncHandler(async (req, res) => {
    const data = await BackupService.listRestoreHistory(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Restore history fetched successfully',
      data: data.items,
      meta: data.pagination,
    });
  }),

  createBackup: asyncHandler(async (req, res) => {
    const destination = req.body.destination || 'computer';
    const result = await BackupService.createBackup(req.user, { destination });

    if (destination === 'computer' && result.buffer) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('X-Backup-Filename', result.filename);
      return res.send(result.buffer);
    }

    return successResponse(res, req, {
      statusCode: 201,
      message: 'Backup uploaded to Google Drive successfully',
      data: result.record,
    });
  }),

  downloadBackup: asyncHandler(async (req, res) => {
    const { buffer, filename } = await BackupService.downloadBackup(req.user, req.params.backupId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Backup-Filename', filename);
    return res.send(buffer);
  }),

  deleteBackup: asyncHandler(async (req, res) => {
    const data = await BackupService.deleteBackup(req.user, req.params.backupId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Backup deleted successfully',
      data,
    });
  }),

  restoreUpload: asyncHandler(async (req, res) => {
    if (!req.file?.buffer) {
      throw new AppError('Backup ZIP file is required', 400, 'FILE_REQUIRED');
    }
    const mode = req.body.mode || RESTORE_MODE.MERGE;
    const result = await BackupService.restoreFromBuffer(
      req.user,
      req.file.buffer,
      req.file.originalname || 'backup.zip',
      mode
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Backup restored successfully',
      data: result.summary,
    });
  }),

  restoreFromDrive: asyncHandler(async (req, res) => {
    const mode = req.body.mode || RESTORE_MODE.MERGE;
    const result = await BackupService.restoreFromDriveBackup(req.user, req.body.backup_id, mode);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Backup restored from Google Drive successfully',
      data: result.summary,
    });
  }),

  googleConnectUrl: asyncHandler(async (req, res) => {
    GoogleDriveService.assertGoogleConfigured();
    const url = GoogleDriveService.getAuthUrl(req.user.userId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Google Drive connect URL generated',
      data: { url },
    });
  }),

  googleCallback: asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect(`${config.FRONTEND_URL}/?tab=backup&ctab=backuptodrive&drive=error`);
    }
    if (!code || !state) {
      throw new AppError('Missing Google OAuth parameters', 400, 'INVALID_OAUTH_CALLBACK');
    }
    await GoogleDriveService.exchangeCodeForTokens(code, state);
    return res.redirect(`${config.FRONTEND_URL}/?tab=backup&ctab=backuptodrive&drive=connected`);
  }),

  googleStatus: asyncHandler(async (req, res) => {
    const status = await GoogleDriveService.getConnectionStatus(req.user.userId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Google Drive status fetched successfully',
      data: status,
    });
  }),

  googleDisconnect: asyncHandler(async (req, res) => {
    const data = await GoogleDriveService.disconnect(req.user.userId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Google Drive disconnected successfully',
      data,
    });
  }),
};

module.exports = BackupController;
