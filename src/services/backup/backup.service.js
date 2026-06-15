const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { formatBytes, formatDuration } = require('../../utils/backup/backupSerialize.utils');
const {
  BACKUP_TYPE,
  BACKUP_STATUS,
  STORAGE_LOCATION,
  RESTORE_MODE,
  RESTORE_REPLACE_ROLES,
} = require('./backup.constants');
const { resolveBackupScope, assertBackupAccess } = require('./backupScope.service');
const { exportBackupData, buildManifest } = require('./backupExport.service');
const { buildExcelExports } = require('./backupExcelExport.service');
const { buildBackupZip, parseBackupZip, buildBackupFilename } = require('./backupPack.service');
const { restoreBackupCollections } = require('./backupRestore.service');
const BackupSettingsService = require('./backupSettings.service');
const GoogleDriveService = require('./googleDrive.service');

const formatBackupRecord = (record) => ({
  backup_id: record.backup_id,
  display_id: record.display_id,
  backup_type: record.backup_type,
  type_label: record.backup_type === 'AUTO' ? 'Auto' : record.backup_type === 'MANUAL_DRIVE' ? 'Drive' : 'Computer',
  status: record.status,
  status_label: record.status === 'SUCCESS' ? 'Success' : record.status === 'FAILED' ? 'Failed' : 'In Progress',
  filename: record.filename,
  file_size_bytes: record.file_size_bytes ? record.file_size_bytes.toString() : null,
  file_size_label: record.file_size_bytes ? formatBytes(record.file_size_bytes) : '—',
  duration_ms: record.duration_ms,
  duration_label: formatDuration(record.duration_ms),
  storage_location: record.storage_location,
  google_drive_file_id: record.google_drive_file_id,
  scope_role: record.scope_role,
  scope_json: record.scope_json,
  error_message: record.error_message,
  created_at: record.created_at,
  completed_at: record.completed_at,
  can_download: record.status === 'SUCCESS',
});

const nextDisplayId = async (userId) => {
  const count = await prisma.backupRecord.count({ where: { user_id: userId } });
  return `BKP-${String(count + 1).padStart(3, '0')}`;
};

const createBackup = async (user, { destination = 'computer' } = {}) => {
  assertBackupAccess(user);
  const scope = await resolveBackupScope(user);
  const settings = await BackupSettingsService.getOrCreateSettings(user.userId);
  const started = Date.now();
  const filename = buildBackupFilename();

  const backupType = destination === 'drive' ? BACKUP_TYPE.MANUAL_DRIVE : BACKUP_TYPE.MANUAL_COMPUTER;
  const storageLocation = destination === 'drive' ? STORAGE_LOCATION.GOOGLE_DRIVE : STORAGE_LOCATION.LOCAL;

  const displayId = await nextDisplayId(user.userId);

  const record = await prisma.backupRecord.create({
    data: {
      display_id: displayId,
      user_id: user.userId,
      backup_type: backupType,
      status: BACKUP_STATUS.IN_PROGRESS,
      filename,
      storage_location: storageLocation,
      scope_role: scope.role,
      scope_json: scope,
    },
  });

  try {
    const { manifest: draftManifest, collections } = await exportBackupData(user, scope, settings);
    const { excelFiles, excelFileNames } = await buildExcelExports(collections, draftManifest);
    const manifest = buildManifest(user, scope, collections, excelFileNames);
    const zipBuffer = buildBackupZip(manifest, collections, excelFiles);
    const durationMs = Date.now() - started;

    let googleDriveFileId = null;
    if (destination === 'drive') {
      const uploaded = await GoogleDriveService.uploadBackupFile(
        user.userId,
        scope,
        filename,
        zipBuffer
      );
      googleDriveFileId = uploaded.id;
    }

    const updated = await prisma.backupRecord.update({
      where: { backup_id: record.backup_id },
      data: {
        status: BACKUP_STATUS.SUCCESS,
        file_size_bytes: BigInt(zipBuffer.length),
        duration_ms: durationMs,
        google_drive_file_id: googleDriveFileId,
        completed_at: new Date(),
      },
    });

    return {
      record: formatBackupRecord(updated),
      buffer: destination === 'computer' ? zipBuffer : null,
      filename,
    };
  } catch (error) {
    await prisma.backupRecord.update({
      where: { backup_id: record.backup_id },
      data: {
        status: BACKUP_STATUS.FAILED,
        error_message: error.message || 'Backup failed',
        completed_at: new Date(),
      },
    });
    throw error;
  }
};

const parsePagination = ({ page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  return { page: pageNum, limit: limitNum, skip: (pageNum - 1) * limitNum };
};

const listHistory = async (user, { page = 1, limit = 20, backup_type } = {}) => {
  assertBackupAccess(user);
  const where = { user_id: user.userId };
  if (backup_type) where.backup_type = backup_type;

  const { page: pageNum, limit: limitNum, skip } = parsePagination({ page, limit });
  const [rows, total] = await Promise.all([
    prisma.backupRecord.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.backupRecord.count({ where }),
  ]);

  return {
    items: rows.map(formatBackupRecord),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) || 1 },
  };
};

const getStats = async (user) => {
  assertBackupAccess(user);
  const where = { user_id: user.userId, status: BACKUP_STATUS.SUCCESS };

  const [total, lastSuccess, computerCount, driveCount] = await Promise.all([
    prisma.backupRecord.count({ where: { user_id: user.userId, status: BACKUP_STATUS.SUCCESS } }),
    prisma.backupRecord.findFirst({
      where,
      orderBy: { created_at: 'desc' },
    }),
    prisma.backupRecord.count({
      where: { user_id: user.userId, backup_type: BACKUP_TYPE.MANUAL_COMPUTER, status: BACKUP_STATUS.SUCCESS },
    }),
    prisma.backupRecord.count({
      where: { user_id: user.userId, backup_type: BACKUP_TYPE.MANUAL_DRIVE, status: BACKUP_STATUS.SUCCESS },
    }),
  ]);

  const settings = await BackupSettingsService.getOrCreateSettings(user.userId);

  return {
    total_backups: total,
    total_computer_backups: computerCount,
    total_drive_backups: driveCount,
    last_backup: lastSuccess ? formatBackupRecord(lastSuccess) : null,
    next_backup_scheduled: settings.auto_backup_enabled ? computeNextBackupLabel(settings) : null,
    settings,
  };
};

const computeNextBackupLabel = (settings) => {
  const [hh, mm] = (settings.auto_backup_time || '02:00').split(':').map(Number);
  const next = new Date();
  next.setHours(hh || 2, mm || 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next.toISOString();
};

const getBackupForUser = async (user, backupId) => {
  const record = await prisma.backupRecord.findFirst({
    where: { backup_id: backupId, user_id: user.userId },
  });
  if (!record) {
    throw new AppError('Backup not found', 404, 'BACKUP_NOT_FOUND');
  }
  return record;
};

const downloadBackup = async (user, backupId) => {
  assertBackupAccess(user);
  const record = await getBackupForUser(user, backupId);

  if (record.status !== BACKUP_STATUS.SUCCESS) {
    throw new AppError('Backup is not available for download', 400, 'BACKUP_NOT_READY');
  }

  if (record.storage_location === STORAGE_LOCATION.GOOGLE_DRIVE) {
    if (!record.google_drive_file_id) {
      throw new AppError('Google Drive file id missing for this backup', 500, 'BACKUP_FILE_MISSING');
    }
    const buffer = await GoogleDriveService.downloadBackupFile(user.userId, record.google_drive_file_id);
    return { buffer, filename: record.filename, record: formatBackupRecord(record) };
  }

  throw new AppError(
    'This backup was downloaded directly to your computer and is not stored on the server',
    404,
    'BACKUP_NOT_STORED'
  );
};

const deleteBackup = async (user, backupId) => {
  assertBackupAccess(user);
  const record = await getBackupForUser(user, backupId);

  if (record.google_drive_file_id) {
    try {
      await GoogleDriveService.deleteBackupFile(user.userId, record.google_drive_file_id);
    } catch {
      // Keep DB cleanup even if Drive delete fails (file may already be gone)
    }
  }

  await prisma.backupRecord.delete({ where: { backup_id: record.backup_id } });
  return { deleted: true, backup_id: backupId };
};

const restoreFromBuffer = async (user, buffer, filename, mode = RESTORE_MODE.MERGE) => {
  assertBackupAccess(user);

  if (!Object.values(RESTORE_MODE).includes(mode)) {
    throw new AppError('Invalid restore mode', 400, 'INVALID_RESTORE_MODE');
  }
  if (mode === RESTORE_MODE.REPLACE && !RESTORE_REPLACE_ROLES.includes(user.role)) {
    throw new AppError('Replace mode is only allowed for Super Admin', 403, 'FORBIDDEN');
  }

  const log = await prisma.backupRestoreLog.create({
    data: {
      user_id: user.userId,
      source_filename: filename,
      restore_mode: mode,
      status: BACKUP_STATUS.IN_PROGRESS,
    },
  });

  let manifest;
  let collections;
  try {
    ({ manifest, collections } = parseBackupZip(buffer));
  } catch (parseError) {
    await prisma.backupRestoreLog.update({
      where: { restore_id: log.restore_id },
      data: {
        status: BACKUP_STATUS.FAILED,
        error_message: parseError.message || 'Invalid backup file',
        completed_at: new Date(),
      },
    });
    throw new AppError(parseError.message || 'Invalid backup file', 400, 'INVALID_BACKUP');
  }

  try {
    const summary = await restoreBackupCollections(user, manifest, collections, mode);
    const completed = await prisma.backupRestoreLog.update({
      where: { restore_id: log.restore_id },
      data: {
        status: BACKUP_STATUS.SUCCESS,
        summary_json: summary,
        completed_at: new Date(),
      },
    });
    return { summary, restore_log: completed };
  } catch (error) {
    await prisma.backupRestoreLog.update({
      where: { restore_id: log.restore_id },
      data: {
        status: BACKUP_STATUS.FAILED,
        error_message: error.message || 'Restore failed',
        completed_at: new Date(),
      },
    });
    throw error;
  }
};

const restoreFromDriveBackup = async (user, backupId, mode = RESTORE_MODE.MERGE) => {
  const record = await getBackupForUser(user, backupId);
  if (!record.google_drive_file_id) {
    throw new AppError('This backup is not stored on Google Drive', 400, 'INVALID_BACKUP_SOURCE');
  }
  const buffer = await GoogleDriveService.downloadBackupFile(user.userId, record.google_drive_file_id);
  const result = await restoreFromBuffer(user, buffer, record.filename, mode);
  await prisma.backupRestoreLog.update({
    where: { restore_id: result.restore_log.restore_id },
    data: { backup_id: backupId },
  });
  return result;
};

const listRestoreHistory = async (user, { page = 1, limit = 10 } = {}) => {
  assertBackupAccess(user);
  const { page: pageNum, limit: limitNum, skip } = parsePagination({ page, limit });
  const [rows, total] = await Promise.all([
    prisma.backupRestoreLog.findMany({
      where: { user_id: user.userId },
      orderBy: { created_at: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.backupRestoreLog.count({ where: { user_id: user.userId } }),
  ]);

  return {
    items: rows.map((row) => ({
      restore_id: row.restore_id,
      source_filename: row.source_filename,
      restore_mode: row.restore_mode,
      status: row.status,
      status_label: row.status === 'SUCCESS' ? 'Completed' : row.status === 'FAILED' ? 'Failed' : 'In Progress',
      summary_json: row.summary_json,
      error_message: row.error_message,
      created_at: row.created_at,
      completed_at: row.completed_at,
    })),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) || 1 },
  };
};

module.exports = {
  createBackup,
  listHistory,
  getStats,
  downloadBackup,
  deleteBackup,
  restoreFromBuffer,
  restoreFromDriveBackup,
  listRestoreHistory,
  formatBackupRecord,
};
