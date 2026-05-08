// backend/src/utils/logger.utils.js
const config = require('../config/index.config');

// Colors only for development console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const isDev = config.isDevelopment;
const isProd = config.isProduction;

// Winston will be loaded only in production (lazy load)
let winstonLogger = null;

const getWinstonLogger = () => {
  if (!winstonLogger && isProd) {
    try {
      const winston = require('winston');
      const DailyRotateFile = require('winston-daily-rotate-file');
      const path = require('path');

      winstonLogger = winston.createLogger({
        level: config.LOG_LEVEL || 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        transports: [
          new DailyRotateFile({
            filename: path.join(config.LOG_DIR, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '20m',
            maxFiles: '14d',
          }),
          new DailyRotateFile({
            filename: path.join(config.LOG_DIR, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
          }),
        ],
      });
    } catch (error) {
      console.error('Failed to initialize Winston logger:', error.message);
      // Fallback to console
      winstonLogger = null;
    }
  }
  return winstonLogger;
};

const getTimestamp = () => {
  return new Date().toISOString().slice(11, 23);
};

const formatMeta = (meta) => {
  if (!meta || Object.keys(meta).length === 0) return '';
  
  // Don't log sensitive data
  const safeMeta = { ...meta };
  delete safeMeta.password;
  delete safeMeta.token;
  delete safeMeta.authorization;
  
  return `\n  └─ ${JSON.stringify(safeMeta, null, 2)}`;
};

// Production logger (Winston)
const prodLog = (level, message, meta) => {
  const winston = getWinstonLogger();
  if (winston) {
    winston[level](message, meta);
  } else {
    // Fallback to console if Winston fails
    console[level](`[${level.toUpperCase()}] ${getTimestamp()} - ${message}`, meta || '');
  }
};

// Development logger (Console with colors)
const devLog = (level, message, meta) => {
  const colorMap = {
    info: colors.green,
    error: colors.red,
    warn: colors.yellow,
    debug: colors.blue,
  };
  
  const color = colorMap[level] || colors.reset;
  const metaStr = formatMeta(meta);
  
  console[level](`${color}[${level.toUpperCase()}]${colors.reset} ${getTimestamp()} - ${message}${metaStr}`);
};

// Main logger interface
const logger = {
  info: (message, meta = {}) => {
    if (isProd) {
      prodLog('info', message, meta);
    } else {
      devLog('info', message, meta);
    }
  },
  
  error: (message, meta = {}) => {
    if (isProd) {
      prodLog('error', message, meta);
    } else {
      devLog('error', message, meta);
    }
  },
  
  warn: (message, meta = {}) => {
    if (isProd) {
      prodLog('warn', message, meta);
    } else {
      devLog('warn', message, meta);
    }
  },
  
  debug: (message, meta = {}) => {
    // Debug logs only in development
    if (!isProd && config.LOG_LEVEL === 'debug') {
      devLog('debug', message, meta);
    }
  },
  
  // For HTTP request logging
  http: (req, res, duration) => {
    const meta = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      requestId: req.id,
      ip: req.ip,
    };
    
    if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.url} - ${res.statusCode}`, meta);
    } else {
      logger.info(`${req.method} ${req.url} - ${res.statusCode}`, meta);
    }
  },
};

module.exports = logger;