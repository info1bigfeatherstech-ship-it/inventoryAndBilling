// backend/src/middlewares/error.middleware.js
const logger = require('../utils/logger.utils');
const config = require('../config/index.config');
const { Prisma } = require('@prisma/client');

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 404 handler
const notFound = (req, res, next) => {
  const error = new AppError(`Route not found: ${req.method} ${req.url}`, 404);
  next(error);
};

// Prisma error handler
const handlePrismaError = (error) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return new AppError(`Duplicate entry: ${error.meta?.target?.join(', ')} already exists`, 409);
      case 'P2025':
        return new AppError('Record not found', 404);
      case 'P2003':
        return new AppError('Foreign key constraint failed', 400);
      case 'P2014':
        return new AppError('Invalid ID format', 400);
      default:
        return new AppError(`Database error: ${error.message}`, 500);
    }
  }
  
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new AppError('Database connection failed', 503);
  }
  
  return null;
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

  // Unknown errors should still be treated as operational response
  if (!(error instanceof AppError)) {
    error = new AppError(error.message || 'Internal server error', error.statusCode || 500, error.code || 'INTERNAL_ERROR');
    error.isOperational = false;
    if (originalStack) {
      error.stack = originalStack;
    }
  }

  // Log error
  logger.error(error.message, {
    requestId: req.id,
    url: req.url,
    method: req.method,
    stack: error.stack,
    ...(error.isOperational ? {} : { critical: true }),
  });
  
  // Send response
  const statusCode = error.statusCode || 500;
  const message = config.isProduction && statusCode === 500
    ? 'Internal server error'
    : error.message;
  
  res.status(statusCode).json({
    success: false,
    message,
    code: error.code || null,
    ...(error.details ? { details: error.details } : {}),
    requestId: req.id,
    ...(config.isDevelopment && { stack: error.stack }),
  });
};

module.exports = {
  AppError,
  notFound,
  errorHandler,
};