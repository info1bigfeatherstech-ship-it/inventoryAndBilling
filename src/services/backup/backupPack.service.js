const AdmZip = require('adm-zip');
const { BACKUP_FORMAT_VERSION, BACKUP_APP_NAME } = require('./backup.constants');

const buildBackupZip = (manifest, collections, excelFiles = {}) => {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

  for (const [fileName, buffer] of Object.entries(excelFiles)) {
    zip.addFile(`excel/${fileName}`, Buffer.from(buffer));
  }

  for (const [name, rows] of Object.entries(collections)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    zip.addFile(
      `data/${name}.json`,
      Buffer.from(JSON.stringify(rows, null, 2), 'utf8')
    );
  }

  return zip.toBuffer();
};

const SUPPORTED_BACKUP_VERSIONS = ['1.0.0', '1.1.0'];

const parseBackupZip = (buffer) => {
  const zip = new AdmZip(buffer);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    throw new Error('Backup ZIP is missing manifest.json');
  }

  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  if (!SUPPORTED_BACKUP_VERSIONS.includes(manifest.format_version) || manifest.app !== BACKUP_APP_NAME) {
    throw new Error('Unsupported or invalid backup file format');
  }

  const collections = {};
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith('data/') || !entry.entryName.endsWith('.json')) continue;
    const collectionName = entry.entryName.replace(/^data\//, '').replace(/\.json$/, '');
    collections[collectionName] = JSON.parse(entry.getData().toString('utf8'));
  }

  return { manifest, collections };
};

const INDIAN_TZ = 'Asia/Kolkata';

/** Date/time parts in Indian timezone with 12-hour AM/PM. */
const getIndianDateTimeParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: INDIAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const pick = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour').padStart(2, '0'),
    minute: pick('minute'),
    second: pick('second'),
    ampm: pick('dayPeriod').toUpperCase(),
  };
};

const buildBackupFilename = (date = new Date()) => {
  const { year, month, day, hour, minute, second, ampm } = getIndianDateTimeParts(date);
  return `BizCentroBackup_${year}-${month}-${day}_${hour}.${minute}.${second}${ampm}.zip`;
};

module.exports = {
  buildBackupZip,
  parseBackupZip,
  buildBackupFilename,
};
