// backend/src/app.js
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const prisma = require('./src/utils/prisma.utils');

// Middleware imports
const createCorsMiddleware = require('./src/middlewares/cors.middleware');
const { helmetConfig, setNoCacheHeaders } = require('./src/middlewares/security.middleware');
const { requestIdMiddleware } = require('./src/middlewares/requestId.middleware');
const { requestLogger, performanceLogger, bodyLogger } = require('./src/middlewares/logging.middleware');
const { notFound, errorHandler } = require('./src/middlewares/error.middleware');
const { limiters } = require('./src/middlewares/rateLimiter.middleware');

// Route imports
const mainRouter = require('./src/routes/index.routes');
const healthRoutes = require('./src/routes/health.routes');
const { allowedOrigins } = require('./src/config/cors.config');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ============ REQUEST ID (MUST BE FIRST) ============
app.use(requestIdMiddleware);

// ============ SECURITY MIDDLEWARE ============
app.use(helmetConfig);
app.use(createCorsMiddleware());

// Always respond to CORS preflight with explicit headers when origin is allowed
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, Idempotency-Key, X-Requested-With');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ============ COMPRESSION (FIXED) ============
app.use(compression({
  level: 6,
  threshold: 1024,
  // ✅ Removed custom filter — default is fine
}));

// ============ LOGGING MIDDLEWARE ============
app.use(requestLogger);
app.use(performanceLogger);
app.use(bodyLogger);

// ============ REQUEST PARSING ============
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ============ RATE LIMITING (login only — billing/API uncapped for now) ============
if (limiters?.login) {
  app.use('/api/v1/auth/login', limiters.login);
}

// ============ NO-CACHE FOR HEALTH ENDPOINTS ============
app.use('/health', setNoCacheHeaders);
app.use('/ready', setNoCacheHeaders);
app.use('/live', setNoCacheHeaders);

// Log CORS configuration at startup for easier debugging in production
try {
  console.info('[Startup] CORS allowed origins:', allowedOrigins);
  console.info('[Startup] COOKIE_DOMAIN:', require('./src/config/index.config').COOKIE_DOMAIN);
} catch (e) {}

// ============ HEALTH ROUTES (NO RATE LIMIT) ============
app.use('/', healthRoutes);

// ============ API ROUTES ============
app.use('/api', mainRouter);

// ============ ERROR HANDLING (MUST BE LAST) ============
app.use(notFound);
app.use(errorHandler);

module.exports = app;