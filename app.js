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

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ============ REQUEST ID (MUST BE FIRST) ============
app.use(requestIdMiddleware);

// ============ SECURITY MIDDLEWARE ============
app.use(helmetConfig);
app.use(createCorsMiddleware());

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

// ============ HEALTH ROUTES (NO RATE LIMIT) ============
app.use('/', healthRoutes);

// ============ API ROUTES ============
app.use('/api', mainRouter);

// ============ ERROR HANDLING (MUST BE LAST) ============
app.use(notFound);
app.use(errorHandler);

module.exports = app;