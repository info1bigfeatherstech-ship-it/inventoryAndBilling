// backend/src/middlewares/logging.middleware.js
const logger = require('../utils/logger.utils');
const config = require('../config/index.config');

const requestLogger = (req, res, next) => {
  logger.debug(`Request: ${req.method} ${req.url}`, {
    requestId: req.id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    query: req.query,
  });
  next();
};

const performanceLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel](`Response: ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`, {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  
  next();
};

// For detailed logging of request/response bodies (only in development)
const bodyLogger = (req, res, next) => {
  if (config.isDevelopment) {
    logger.debug(`Request Body:`, { requestId: req.id, body: req.body });
  }
  next();
};

module.exports = {
  requestLogger,
  performanceLogger,
  bodyLogger,
};