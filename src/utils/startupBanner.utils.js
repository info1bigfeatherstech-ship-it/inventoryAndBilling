const os = require('os');

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const supportsColor = () => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return Boolean(process.stdout.isTTY);
};

const stripAnsi = (input) => String(input).replace(/\x1b\[[0-9;]*m/g, '');

const visibleLen = (input) => stripAnsi(input).length;

const colorize = (text, color) => {
  if (!supportsColor()) return String(text);
  return `${color}${text}${ansi.reset}`;
};

const padRight = (text, width) => {
  const str = String(text);
  const len = visibleLen(str);
  if (len >= width) return str;
  return str + ' '.repeat(width - len);
};

const padLeft = (text, width) => {
  const str = String(text);
  const len = visibleLen(str);
  if (len >= width) return str;
  return ' '.repeat(width - len) + str;
};

const center = (text, width) => {
  const str = String(text);
  const len = visibleLen(str);
  if (len >= width) return str;
  const left = Math.floor((width - len) / 2);
  const right = width - len - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
};

const statusLabel = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'up' || s === 'ready' || s === 'configured') return colorize('UP', ansi.green);
  if (s === 'down' || s === 'unhealthy') return colorize('DOWN', ansi.red);
  if (s === 'disabled') return colorize('DISABLED', ansi.gray);
  if (s === 'misconfigured') return colorize('MISCONFIG', ansi.yellow);
  if (s === 'not_configured') return colorize('NOT_SET', ansi.gray);
  return colorize(String(status || 'UNKNOWN').toUpperCase(), ansi.yellow);
};

const kvRow = (key, value, keyWidth) => {
  const k = supportsColor() ? colorize(padRight(key, keyWidth), ansi.gray) : padRight(key, keyWidth);
  return `${k}  ${value}`;
};

const safeJoin = (arr, sep = ', ') => {
  return (arr || []).filter(Boolean).join(sep);
};

const getLocalIps = () => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (!iface || iface.internal) continue;
      if (iface.family === 'IPv4') ips.push(iface.address);
    }
  }
  return Array.from(new Set(ips));
};

const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  const mb = b / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(0)}MB`;
  return `${(mb / 1024).toFixed(1)}GB`;
};

const parseDbName = (databaseUrl) => {
  try {
    const u = new URL(String(databaseUrl || ''));
    const path = u.pathname || '';
    const name = path.startsWith('/') ? path.slice(1) : path;
    return name || '';
  } catch {
    return '';
  }
};

const makeBox = (title, leftLines, rightLines) => {
  const padding = 2;
  const gap = 4;

  const leftWidth = Math.max(24, ...leftLines.map((l) => visibleLen(l)));
  const rightWidth = rightLines.length ? Math.max(24, ...rightLines.map((l) => visibleLen(l))) : 0;
  const contentWidth = rightLines.length
    ? leftWidth + gap + rightWidth
    : leftWidth;

  const width = Math.min(Math.max(contentWidth, 66), 110);
  const innerWidth = width;

  const top = `╔${'═'.repeat(innerWidth + padding * 2)}╗`;
  const mid = `╠${'═'.repeat(innerWidth + padding * 2)}╣`;
  const bot = `╚${'═'.repeat(innerWidth + padding * 2)}╝`;

  const lines = [];
  lines.push(top);
  const titleStyled = supportsColor()
    ? `${ansi.bold}${colorize(title, ansi.cyan)}${ansi.reset}`
    : title;
  lines.push(`║${' '.repeat(padding)}${center(titleStyled, innerWidth)}${' '.repeat(padding)}║`);
  lines.push(mid);

  const rows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < rows; i++) {
    const left = leftLines[i] || '';
    const right = rightLines[i] || '';

    if (rightLines.length) {
      const leftPadded = padRight(left, leftWidth);
      const rightPadded = padRight(right, rightWidth);
      const combined = `${leftPadded}${' '.repeat(gap)}${rightPadded}`;
      lines.push(`║${' '.repeat(padding)}${padRight(combined, innerWidth)}${' '.repeat(padding)}║`);
    } else {
      lines.push(`║${' '.repeat(padding)}${padRight(left, innerWidth)}${' '.repeat(padding)}║`);
    }
  }

  lines.push(bot);
  return lines.join(os.EOL);
};

const printStartupBanner = (options = {}) => {
  const {
    appName,
    version,
    env,
    port,
    apiUrl,
    healthUrl,
    readyUrl,
    liveUrl,
    connectivity,
    redisRateLimitEnabled,
    databaseUrl,
  } = options;

  const left = [];
  const right = [];

  const keyWidth = 8;
  left.push(kvRow('ENV', env, keyWidth));
  left.push(kvRow('VER', version || '-', keyWidth));
  left.push(kvRow('PORT', port, keyWidth));
  left.push(kvRow('API', apiUrl, keyWidth));
  left.push(kvRow('HEALTH', healthUrl, keyWidth));
  left.push(kvRow('READY', readyUrl, keyWidth));
  left.push(kvRow('LIVE', liveUrl, keyWidth));

  const ips = getLocalIps();
  const host = os.hostname();
  const mem = process.memoryUsage();
  const memLine = `${formatBytes(mem.rss)} RSS`;
  left.push(kvRow('HOST', host, keyWidth));
  left.push(kvRow('IP', ips.length ? safeJoin(ips, ' | ') : '-', keyWidth));
  left.push(kvRow('PID', process.pid, keyWidth));
  left.push(kvRow('MEM', memLine, keyWidth));

  if (connectivity) {
    const db = connectivity.database || {};
    const redis = connectivity.redis || {};
    const r2 = connectivity.cloudflareR2 || {};

    const dbLine = `${statusLabel(db.status)}${db.latencyMs != null ? ` ${colorize('•', ansi.gray)} ${db.latencyMs}ms` : ''}`;
    const redisLine = `${statusLabel(redis.status)}${
      redis.latencyMs != null ? ` ${colorize('•', ansi.gray)} ${redis.latencyMs}ms` : ''
    }${redis.host ? ` ${colorize('•', ansi.gray)} ${redis.host}:${redis.port}` : ''}`;
    const r2Line = `${statusLabel(r2.status)}${r2.bucket ? ` ${colorize('•', ansi.gray)} ${r2.bucket}` : ''}`;

    const dbName = parseDbName(databaseUrl);
    const dbNameLine = dbName ? `${colorize('•', ansi.gray)} ${dbName}` : '';
    right.push(kvRow('DB', `${dbLine} ${dbNameLine}`.trim(), 6));
    right.push(kvRow('REDIS', redisLine, 6));
    right.push(
      kvRow(
        'RATELM',
        redisRateLimitEnabled ? colorize('ENABLED', ansi.green) : colorize('DISABLED', ansi.gray),
        6
      )
    );
    right.push(kvRow('R2', r2Line, 6));
  }

  const banner = makeBox(appName, left, right);
  process.stdout.write(`${os.EOL}${banner}${os.EOL}${os.EOL}`);
};

module.exports = { printStartupBanner };

