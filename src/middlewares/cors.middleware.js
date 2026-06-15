// backend/src/middlewares/cors.middleware.js
const cors = require('cors');
const config = require('../config/index.config');
const { allowedOrigins, isPublicPath, isLoopbackOrigin } = require('../config/cors.config');
const logger = require('../utils/logger.utils');

const createCorsMiddleware = () => {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is allowed
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check loopback on same port
      if (isLoopbackOrigin(origin, config.PORT)) {
        return callback(null, true);
      }

      // Log blocked origins in production
      if (config.isProduction) {
        logger.warn(`CORS blocked origin: ${origin}`);
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key'],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'Content-Disposition',
      'X-Backup-Filename',
    ],
    maxAge: 86400, // 24 hours
  });
};

module.exports = createCorsMiddleware;