// backend/src/config/cors.js
const config = require('./index.config');

// Default allowed origins
const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
];

// Merge with env origins
const allowedOrigins = [...new Set([...defaultOrigins, ...config.ALLOWED_ORIGINS])];

// Paths that need special CORS handling
const publicPaths = ['/api/health', '/api/ready', '/api/live'];

// Owner review paths (stricter CORS maybe)
const ownerReviewPaths = ['/api/v1/vendors', '/api/v1/products'];

function isPublicPath(path) {
  return publicPaths.some(p => path.startsWith(p));
}

function isOwnerReviewPath(path) {
  return ownerReviewPaths.some(p => path.startsWith(p));
}

function isLoopbackOrigin(origin, serverPort) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && 
           url.port === String(serverPort);
  } catch {
    return false;
  }
}

module.exports = {
  allowedOrigins,
  isPublicPath,
  isOwnerReviewPath,
  isLoopbackOrigin,
};