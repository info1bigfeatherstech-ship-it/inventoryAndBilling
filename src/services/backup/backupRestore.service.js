const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { deserializeRow } = require('../../utils/backup/backupSerialize.utils');
const { getCollectionMeta } = require('../../utils/backup/backupCollectionMap.utils');
const {
  RESTORE_COLLECTION_ORDER,
  RESTORE_DELETE_ORDER,
  RESTORE_MODE,
  RESTORE_REPLACE_ROLES,
} = require('./backup.constants');
const { validateRestoreAgainstScope } = require('./backupScope.service');

const sanitizeUserRow = (row) => {
  const data = deserializeRow(row);
  if (data.password_hash === null || data.password_hash === undefined) {
    delete data.password_hash;
  }
  return data;
};

const sanitizeRowForCollection = (collectionName, row) => {
  if (collectionName === 'users') return sanitizeUserRow(row);
  return deserializeRow(row);
};

const getPrimaryKeyValue = (collectionName, row, idField) => {
  const value = row[idField];
  if (!value) {
    throw new AppError(`Backup row missing ${idField} in ${collectionName}`, 400, 'INVALID_BACKUP');
  }
  return value;
};

const upsertRow = async (tx, collectionName, row, mode) => {
  const meta = getCollectionMeta(collectionName);
  if (!meta) return { action: 'skipped' };

  const delegate = tx[meta.model];
  if (!delegate) {
    throw new AppError(`Unknown backup collection: ${collectionName}`, 500, 'RESTORE_ERROR');
  }

  const data = sanitizeRowForCollection(collectionName, row);
  const id = getPrimaryKeyValue(collectionName, data, meta.idField);
  const where = { [meta.idField]: id };

  if (collectionName === 'users') {
    const existing = await delegate.findUnique({ where });
    if (existing) {
      if (mode === RESTORE_MODE.MISSING_ONLY) return { action: 'skipped' };
      const { password_hash: _pw, ...updateData } = data;
      await delegate.update({ where, data: updateData });
      return { action: 'updated' };
    }
    const { password_hash: _pw2, ...createData } = data;
    await delegate.create({ data: { ...createData, password_hash: null } });
    return { action: 'created' };
  }

  if (mode === RESTORE_MODE.MISSING_ONLY) {
    const existing = await delegate.findUnique({ where });
    if (existing) return { action: 'skipped' };
    await delegate.create({ data });
    return { action: 'created' };
  }

  await delegate.upsert({
    where,
    create: data,
    update: data,
  });
  return { action: mode === RESTORE_MODE.MERGE ? 'upserted' : 'upserted' };
};

const deleteCollectionRows = async (tx, collectionName, rows) => {
  const meta = getCollectionMeta(collectionName);
  if (!meta || !rows?.length) return 0;

  const delegate = tx[meta.model];
  const ids = rows.map((row) => row[meta.idField]).filter(Boolean);
  if (!ids.length) return 0;

  const result = await delegate.deleteMany({
    where: { [meta.idField]: { in: ids } },
  });
  return result.count;
};

const restoreBackupCollections = async (user, manifest, collections, mode) => {
  const { resolveBackupScope } = require('./backupScope.service');
  const actorScope = await resolveBackupScope(user);

  validateRestoreAgainstScope(manifest.scope, actorScope);

  if (mode === RESTORE_MODE.REPLACE) {
    if (!RESTORE_REPLACE_ROLES.includes(user.role)) {
      throw new AppError('Replace mode is only allowed for Super Admin', 403, 'FORBIDDEN');
    }
  }

  const summary = {
    mode,
    collections: {},
    total_created: 0,
    total_updated: 0,
    total_skipped: 0,
  };

  await prisma.$transaction(async (tx) => {
    if (mode === RESTORE_MODE.REPLACE) {
      for (const collectionName of RESTORE_DELETE_ORDER) {
        const rows = collections[collectionName];
        if (!rows?.length) continue;
        if (collectionName === 'users') continue;
        await deleteCollectionRows(tx, collectionName, rows);
      }
    }

    for (const collectionName of RESTORE_COLLECTION_ORDER) {
      const rows = collections[collectionName];
      if (!Array.isArray(rows) || !rows.length) continue;

      summary.collections[collectionName] = { created: 0, updated: 0, skipped: 0 };

      for (const row of rows) {
        const result = await upsertRow(tx, collectionName, row, mode);
        if (result.action === 'created') {
          summary.collections[collectionName].created += 1;
          summary.total_created += 1;
        } else if (result.action === 'updated' || result.action === 'upserted') {
          summary.collections[collectionName].updated += 1;
          summary.total_updated += 1;
        } else {
          summary.collections[collectionName].skipped += 1;
          summary.total_skipped += 1;
        }
      }
    }
  }, { timeout: 120000 });

  return summary;
};

module.exports = {
  restoreBackupCollections,
};
