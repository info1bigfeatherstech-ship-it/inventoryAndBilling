// backend/src/middlewares/cors.middleware.js
const cors = require('cors');
const config = require('../config/index.config');
const { allowedOrigins, isPublicPath, isLoopbackOrigin, isAllowedOrigin } = require('../config/cors.config');
const logger = require('../utils/logger.utils');

const createCorsMiddleware = () => {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl)
      if (!origin) return callback(null, true);

      // DEBUG: log incoming origin for diagnosis in development
      try {
        if (process.env.NODE_ENV === 'development') console.debug('[CORS] Incoming origin:', origin);
      } catch (e) {}

      if (isAllowedOrigin(origin, config.COOKIE_DOMAIN)) {
        if (process.env.NODE_ENV === 'development') console.debug('[CORS] Allowed origin:', origin);
        return callback(null, true);
      }

      // Log blocked origin for easier debugging
      logger.warn && logger.warn(`CORS blocked origin: ${origin}`);
      if (process.env.NODE_ENV === 'development') console.debug('[CORS] Allowed origins list:', allowedOrigins);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key', 'X-Requested-With', 'X-Api-Key'],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'Content-Disposition',
      'X-Backup-Filename',
    ],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });
};

module.exports = createCorsMiddleware;