// backend/src/middlewares/error.middleware.js
const logger = require('../utils/logger.utils');
const config = require('../config/index.config');
const { Prisma } = require('@prisma/client');
const { AppError } = require('../errors/AppError');
const { normalizeExternalError } = require('../utils/externalError.utils');

/** Strip Prisma CLI ANSI color codes from error messages shown to clients. */
const stripAnsi = (text) => String(text || '').replace(/\x1B\[[0-9;]*m/g, '');

const SCHEMA_OUT_OF_DATE_MESSAGE =
  'This feature is not fully set up yet. Please contact your administrator.';

const GENERIC_REQUEST_FAILED = 'Unable to complete the request. Please try again.';

const isSchemaDriftMessage = (raw) =>
  /column `.+` does not exist/i.test(raw) ||
  /table `.+` does not exist/i.test(raw) ||
  /does not exist in the current database/i.test(raw);

const isTechnicalDbMessage = (raw) =>
  isSchemaDriftMessage(raw) ||
  /Invalid `prisma\./i.test(raw) ||
  /prisma\.\w+\.(create|update|delete|findMany|findFirst|findUnique)/i.test(raw) ||
  /invocation in\s+/i.test(raw);

const toClientSafeMessage = (message, fallback = GENERIC_REQUEST_FAILED) => {
  const raw = stripAnsi(message);
  if (!raw || isTechnicalDbMessage(raw)) {
    return fallback;
  }
  return raw.length > 240 ? `${raw.slice(0, 237)}…` : raw;
};

// Prisma error handler
const handlePrismaError = (error) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return new AppError('This record already exists. Please use a different value.', 409, 'DUPLICATE_ENTRY');
      case 'P2025':
        return new AppError('Record not found', 404, 'NOT_FOUND');
      case 'P2003':
        return new AppError('Related record is missing or invalid.', 400, 'INVALID_REFERENCE');
      case 'P2014':
        return new AppError('Invalid ID format', 400, 'INVALID_ID');
      case 'P2021':
      case 'P2022':
        return new AppError(SCHEMA_OUT_OF_DATE_MESSAGE, 500, 'DB_SCHEMA_OUT_OF_DATE');
      default:
        return new AppError(GENERIC_REQUEST_FAILED, 500, 'DATABASE_ERROR');
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError(
      'Some data was invalid. Please check the form and try again.',
      400,
      'DATABASE_VALIDATION_ERROR'
    );
  }
  
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new AppError('Database connection failed', 503, 'DB_UNAVAILABLE');
  }

  const raw = stripAnsi(error?.message || '');
  if (isSchemaDriftMessage(raw)) {
    return new AppError(SCHEMA_OUT_OF_DATE_MESSAGE, 500, 'DB_SCHEMA_OUT_OF_DATE');
  }

  if (isTechnicalDbMessage(raw)) {
    return new AppError(GENERIC_REQUEST_FAILED, 500, 'DATABASE_ERROR');
  }
  
  return null;
};

// 404 handler
const notFound = (req, res, next) => {
  const error = new AppError(`Route not found: ${req.method} ${req.url}`, 404);
  next(error);
};

// Global error handler
const errorHandler = (err, req, res, next) => {
  let error = err;
  const originalStack = err?.stack;
  
  // Handle Prisma errors
  const prismaError = handlePrismaError(err);
  if (prismaError) {
    error = prismaError;
  }
  
  // JSON parse / body parser errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = new AppError('Invalid JSON payload', 400, 'INVALID_JSON');
  }

  // JWT errors when thrown directly by jsonwebtoken
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid access token', 401, 'INVALID_TOKEN');
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Access token expired', 401, 'TOKEN_EXPIRED');
  }

  const externalError = normalizeExternalError(err);
  if (externalError) {
    error = externalError;
  }

  // Unknown errors should still be treated as operational response
  if (!(error instanceof AppError)) {
    const safeMessage = toClientSafeMessage(error.message, 'Internal server error');
    error = new AppError(safeMessage, error.statusCode || 500, error.code || 'INTERNAL_ERROR');
    error.isOperational = false;
    if (originalStack) {
      error.stack = originalStack;
    }
  }

  const statusCode = error.statusCode || 500;
  const isServerFault = statusCode >= 500 && !error.isOperational;

  // Log: concise for expected errors; stack only in debug for unexpected faults
  const logPayload = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode,
    code: error.code || null,
  };

  if (isServerFault && config.LOG_LEVEL === 'debug') {
    logPayload.stack = error.stack;
  } else if (!error.isOperational) {
    logPayload.stack = error.stack;
    logPayload.critical = true;
  }

  logger.error(error.message, logPayload);

  const message =
    config.isProduction && isServerFault
      ? 'Internal server error'
      : toClientSafeMessage(error.message, isServerFault ? 'Internal server error' : GENERIC_REQUEST_FAILED);

  res.status(statusCode).json({
    success: false,
    message,
    code: error.code || null,
    ...(error.details ? { details: error.details } : {}),
    requestId: req.id,
  });
};

module.exports = {
  AppError,
  notFound,
  errorHandler,
};