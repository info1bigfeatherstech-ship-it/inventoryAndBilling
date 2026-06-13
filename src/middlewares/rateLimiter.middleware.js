// backend/src/middlewares/rateLimiter.middleware.js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const Redis = require('ioredis');
const config = require('../config/index.config');
const logger = require('../utils/logger.utils');

/** Redis key namespace — avoids clashing with other apps on shared Redis (e.g. ecommerce). */
const RL_KEY_PREFIX = 'rl:bizCentro';

let redisClient = null;

const getRedisClient = () => {
  if (!config.ENABLE_REDIS_RATE_LIMIT) {
    return null;
  }

  if (!redisClient && config.REDIS_HOST) {
    try {
      redisClient = new Redis({
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        enableReadyCheck: true,
        enableOfflineQueue: true,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.warn('Redis rate limiter unavailable, using in-memory store');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
      });

      redisClient.on('error', (error) => {
        logger.warn('Redis rate limiter fallback to memory store', { error: error.message });
        redisClient = null;
      });

    } catch (error) {
      logger.error('Failed to initialize Redis client:', error.message);
      redisClient = null;
    }
  }
  return redisClient;
};

// Helper function for IPv6-safe key generation
const getIpKey = (req) => {
  // Use the built-in ipKeyGenerator pattern
  return req.ip || req.connection.remoteAddress || 'unknown';
};

const createRateLimiter = (options = {}) => {
  const {
    windowMs = config.RATE_LIMIT_WINDOW_MS,
    max = config.RATE_LIMIT_MAX_GENERAL,
    keyPrefix = 'rl',
  } = options;

  const redis = getRedisClient();
  let store;
  if (redis) {
    try {
      store = new RedisStore({
        sendCommand: (...args) => {
          try {
            return redis.call(...args);
          } catch (error) {
            return Promise.reject(error);
          }
        },
        prefix: `${keyPrefix}:`,
      });
    } catch (error) {
      logger.warn('Rate limiter Redis store unavailable, using in-memory store', {
        error: error.message,
      });
      store = undefined;
      redisClient = null;
    }
  }

  return rateLimit({
    windowMs,
    max,
    store,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getIpKey,  // ✅ Using proper IPv6-safe function
    skip: (req) => {
      if (config.isDevelopment) return true;
      if (req.path === '/health' || req.path === '/ready' || req.path === '/live') return true;
      return false;
    },
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for ${req.ip} on ${req.path}`);
      res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000),
        requestId: req.id,
      });
    },
    passOnStoreError: true,
  });
};

// Pre-configured limiters — only `login` is mounted in app.js for now.
const limiters = {
  login: createRateLimiter({
    max: 5,
    windowMs: 5 * 60 * 1000,
    keyPrefix: `${RL_KEY_PREFIX}:login`,
  }),

  // Reserved for future use (not mounted — billing needs high throughput).
  general: createRateLimiter({
    max: config.RATE_LIMIT_MAX_GENERAL,
    keyPrefix: `${RL_KEY_PREFIX}:general`,
  }),

  write: createRateLimiter({
    max: 50,
    windowMs: 15 * 60 * 1000,
    keyPrefix: `${RL_KEY_PREFIX}:write`,
  }),

  sensitive: createRateLimiter({
    max: 10,
    windowMs: 15 * 60 * 1000,
    keyPrefix: `${RL_KEY_PREFIX}:sensitive`,
  }),

  admin: createRateLimiter({
    max: config.RATE_LIMIT_MAX_ADMIN,
    keyPrefix: `${RL_KEY_PREFIX}:admin`,
  }),
};

module.exports = {
  limiters,
  createRateLimiter,
  RL_KEY_PREFIX,
};