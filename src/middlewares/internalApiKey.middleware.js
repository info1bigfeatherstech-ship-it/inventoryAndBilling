const crypto = require('crypto');
const config = require('../config/index.config');
const { AppError } = require('../errors/AppError');

const timingSafeEqualString = (a, b) => {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

/**
 * Service-to-service auth for e-comm / wholesale stock APIs.
 * Header: X-Api-Key: <INTERNAL_STOCK_API_KEY>
 * Also accepts Authorization: ApiKey <key> or Bearer <key> when key matches.
 */
const requireInternalStockApiKey = (req, res, next) => {
  const expected = config.INTERNAL_STOCK_API_KEY;
  if (!expected) {
    return next(
      new AppError(
        'Internal stock API is not configured (INTERNAL_STOCK_API_KEY missing)',
        503,
        'INTERNAL_STOCK_API_DISABLED'
      )
    );
  }

  const headerKey = String(req.headers['x-api-key'] || '').trim();
  const auth = String(req.headers.authorization || '').trim();
  let candidate = headerKey;

  if (!candidate && auth) {
    const apiKeyMatch = auth.match(/^ApiKey\s+(.+)$/i);
    const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
    candidate = (apiKeyMatch?.[1] || bearerMatch?.[1] || '').trim();
  }

  if (!candidate || !timingSafeEqualString(candidate, expected)) {
    return next(new AppError('Invalid or missing API key', 401, 'INVALID_API_KEY'));
  }

  req.internalStock = { authenticated: true };
  return next();
};

module.exports = {
  requireInternalStockApiKey,
};
