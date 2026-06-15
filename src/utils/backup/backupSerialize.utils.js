/**
 * Serialize Prisma rows for JSON backup files (Dates → ISO strings).
 */

const serializeValue = (value) => {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return value;
};

const serializeRows = (rows) => {
  if (!rows) return [];
  return rows.map((row) => serializeValue(row));
};

const parseBackupDate = (value) => {
  if (value === null || value === undefined || value === '') return value;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d;
};

const deserializeRow = (row) => {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (key.endsWith('_at') || key.endsWith('_date') || key === 'expected_date' || key === 'arrived_at' || key === 'expiry_date' || key === 'last_purchase') {
      if (typeof out[key] === 'string') {
        out[key] = parseBackupDate(out[key]);
      }
    }
  }
  return out;
};

const formatBytes = (bytes) => {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDuration = (ms) => {
  if (!ms && ms !== 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
};

module.exports = {
  serializeRows,
  serializeValue,
  deserializeRow,
  formatBytes,
  formatDuration,
};
