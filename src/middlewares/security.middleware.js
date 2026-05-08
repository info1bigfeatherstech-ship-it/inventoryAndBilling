// backend/src/middlewares/security.middleware.js
const helmet = require('helmet');

// CSP directives
const getCspDirectives = () => {
  return {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  };
};

// ✅ FIXED: helmetMiddleware is a FUNCTION
const helmetConfig = helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: {
    directives: getCspDirectives(),
  },
  frameguard: { action: 'deny' },
  noSniff: true,
});

// No-cache headers for sensitive endpoints
const setNoCacheHeaders = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

module.exports = {
  helmetConfig,  // ✅ Export as function
  setNoCacheHeaders,
};