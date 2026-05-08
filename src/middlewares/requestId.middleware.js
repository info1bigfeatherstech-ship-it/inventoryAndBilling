// backend/src/middlewares/requestId.middleware.js
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const sanitizeRequestId = (value) => {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (candidate.length > 128) return '';
  // Only allow alphanumeric, hyphens, underscores, colons, periods
  return /^[A-Za-z0-9._:-]+$/.test(candidate) ? candidate : '';
};

const generateRequestId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
};

const requestIdMiddleware = (req, res, next) => {
  const incomingId = sanitizeRequestId(req.headers['x-request-id']);
  req.id = incomingId || generateRequestId();
  req.startTime = Date.now();
  
  res.setHeader('X-Request-ID', req.id);

  next();
};

// For use in controllers to get duration
const getRequestDuration = (req) => {
  if (!req.startTime) return 0;
  return Date.now() - req.startTime;
};

module.exports = {
  requestIdMiddleware,
  getRequestDuration,
};