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

function parseHostname(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function isAllowedOrigin(origin, cookieDomain) {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  if (isLoopbackOrigin(origin, config.PORT)) return true;

  try {
    const { hostname } = new URL(origin);
    const normalizedCookieDomain = (cookieDomain || '').replace(/^\./, '');
    if (normalizedCookieDomain && hostname === normalizedCookieDomain) return true;
    if (normalizedCookieDomain && hostname.endsWith(`.${normalizedCookieDomain}`)) return true;

    for (const allowed of allowedOrigins) {
      const allowedHost = parseHostname(allowed);
      if (!allowedHost) continue;
      if (hostname === allowedHost) return true;
      if (hostname.endsWith(`.${allowedHost}`)) return true;
    }
  } catch {
    return false;
  }

  return false;
}

module.exports = {
  allowedOrigins,
  isPublicPath,
  isOwnerReviewPath,
  isLoopbackOrigin,
  isAllowedOrigin,
};