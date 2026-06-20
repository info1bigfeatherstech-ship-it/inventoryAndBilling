// backend/src/middlewares/cors.middleware.js
const cors = require('cors');
const config = require('../config/index.config');
const { allowedOrigins, isPublicPath, isLoopbackOrigin } = require('../config/cors.config');
const logger = require('../utils/logger.utils');

const createCorsMiddleware = () => {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl)
      if (!origin) return callback(null, true);

      // Exact match against configured list
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Allow loopback origins (useful for dev on same port)
      if (isLoopbackOrigin(origin, config.PORT)) return callback(null, true);

      // Allow subdomains of COOKIE_DOMAIN or any configured domain root
      try {
        const url = new URL(origin);
        const host = url.hostname;
        const cookieDomain = (config.COOKIE_DOMAIN || '').replace(/^\./, '');
        if (cookieDomain && host === cookieDomain) return callback(null, true);
        if (cookieDomain && host.endsWith(`.${cookieDomain}`)) return callback(null, true);

        // Also allow when origin hostname ends with any configured allowed origin hostname
        for (const a of allowedOrigins) {
          try {
            const ah = new URL(a).hostname;
            if (ah && host === ah) return callback(null, true);
            if (ah && host.endsWith(`.${ah}`)) return callback(null, true);
          } catch (e) {
            // ignore parse errors for non-URL entries
          }
        }
      } catch (e) {
        // ignore URL parse issues and fall through to reject
      }

      if (config.isProduction) logger.warn(`CORS blocked origin: ${origin}`);
      // Pass error to CORS — this results in no CORS headers being sent
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key', 'X-Requested-With'],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'Content-Disposition',
      'X-Backup-Filename',
    ],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 204,
  });
};

module.exports = createCorsMiddleware;