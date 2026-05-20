// backend/src/config/index.js
const dotenv = require('dotenv');
const path = require('path');

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

class Config {
  constructor() {
    this.validate();
  }

  validate() {
    const errors = [];
    const warnings = [];
    const isProd = this.NODE_ENV === 'production';

    // Required variables
    const required = ['DATABASE_URL'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length) {
      errors.push(`Missing required env variables: ${missing.join(', ')}`);
    }

    // Production specific checks
    if (isProd) {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-key') {
        warnings.push('JWT_SECRET should be a strong secret in production');
      }
      if (!process.env.COOKIE_DOMAIN) {
        warnings.push('COOKIE_DOMAIN not set — cross-subdomain auth may fail');
      }
      if (!process.env.REDIS_HOST) {
        warnings.push('REDIS_HOST not set — rate limiting may not work properly');
      }
    }

    // Log warnings
    for (const warning of warnings) {
      console.warn(`[Config Warning] ${warning}`);
    }

    // Throw on errors
    if (errors.length) {
      for (const error of errors) {
        console.error(`[Config Error] ${error}`);
      }
      throw new Error('Configuration validation failed');
    }
  }

  // Server
  get NODE_ENV() {
    return process.env.NODE_ENV || 'development';
  }

  get PORT() {
    return parseInt(process.env.PORT, 10) || 3000;
  }

  get API_VERSION() {
    return process.env.API_VERSION || 'v1';
  }

  // Database
  get DATABASE_URL() {
    return process.env.DATABASE_URL;
  }

  get DB_POOL_SIZE() {
    return parseInt(process.env.DB_POOL_SIZE, 10) || 10;
  }

  get DB_CONNECTION_TIMEOUT() {
    return parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 30000;
  }

  // Redis
  get REDIS_HOST() {
    return process.env.REDIS_HOST || 'localhost';
  }

  get REDIS_PORT() {
    return parseInt(process.env.REDIS_PORT, 10) || 6379;
  }

  get REDIS_PASSWORD() {
    return process.env.REDIS_PASSWORD || undefined;
  }

  get ENABLE_REDIS_RATE_LIMIT() {
    return String(process.env.ENABLE_REDIS_RATE_LIMIT || 'false').toLowerCase() === 'true';
  }

  /**
   * Active media backend: cloudinary | cloudflare_r2
   * Falls back to cloudinary when unset (dev-friendly).
   */
  get MEDIA_PROVIDER() {
    const raw = String(process.env.MEDIA_PROVIDER || 'cloudinary').trim().toLowerCase();
    if (raw === 'r2' || raw === 'cloudflare' || raw === 'cloudflare_r2') return 'cloudflare_r2';
    return 'cloudinary';
  }

  get CLOUDINARY_CLOUD_NAME() {
    return process.env.CLOUDINARY_CLOUD_NAME || '';
  }

  get CLOUDINARY_API_KEY() {
    return process.env.CLOUDINARY_API_KEY || '';
  }

  get CLOUDINARY_API_SECRET() {
    return process.env.CLOUDINARY_API_SECRET || '';
  }

  get CLOUDINARY_FOLDER() {
    return process.env.CLOUDINARY_FOLDER || 'vyaapar/products';
  }

  // Cloudflare R2
  get R2_ENABLED() {
    return String(process.env.R2_ENABLED || 'false').toLowerCase() === 'true';
  }

  get R2_ENDPOINT() {
    return process.env.R2_ENDPOINT || '';
  }

  get R2_BUCKET() {
    return process.env.R2_BUCKET || '';
  }

  get R2_ACCESS_KEY_ID() {
    return process.env.R2_ACCESS_KEY_ID || '';
  }

  get R2_SECRET_ACCESS_KEY() {
    return process.env.R2_SECRET_ACCESS_KEY || '';
  }

  get R2_PUBLIC_BASE_URL() {
    return process.env.R2_PUBLIC_BASE_URL || '';
  }

  get PRODUCT_CACHE_TTL_SEC() {
    return parseInt(process.env.PRODUCT_CACHE_TTL_SEC, 10) || 300;
  }

  // JWT
  get JWT_SECRET() {
    return process.env.JWT_SECRET || 'dev-secret-key-do-not-use-in-production';
  }

  get JWT_EXPIRES_IN() {
    return process.env.JWT_EXPIRES_IN || '7d';
  }

  get JWT_REFRESH_SECRET() {
    return process.env.JWT_REFRESH_SECRET || this.JWT_SECRET;
  }

  get JWT_REFRESH_EXPIRES_IN() {
    return process.env.JWT_REFRESH_EXPIRES_IN || '30d';
  }

  get COOKIE_DOMAIN() {
    return process.env.COOKIE_DOMAIN || '';
  }

  // Admin bootstrap
  get ADMIN_PHONE() {
    return process.env.ADMIN_PHONE || '';
  }

  get ADMIN_PASSWORD() {
    return process.env.ADMIN_PASSWORD || '';
  }

  get ADMIN_NAME() {
    return process.env.ADMIN_NAME || 'Super Admin';
  }

  // CORS
  get ALLOWED_ORIGINS() {
    const origins = process.env.ALLOWED_ORIGINS || '';
    return origins.split(',').map(o => o.trim()).filter(Boolean);
  }

  get CORS_ALLOWED_HEADERS() {
    return ['Content-Type', 'Authorization', 'X-Request-ID'];
  }

  // Rate Limiting
  get RATE_LIMIT_WINDOW_MS() {
    return parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000; // 15 min
  }

  get RATE_LIMIT_MAX_GENERAL() {
    return parseInt(process.env.RATE_LIMIT_MAX_GENERAL, 10) || 100;
  }

  get RATE_LIMIT_MAX_SENSITIVE() {
    return parseInt(process.env.RATE_LIMIT_MAX_SENSITIVE, 10) || 20;
  }

  get RATE_LIMIT_MAX_ADMIN() {
    return parseInt(process.env.RATE_LIMIT_MAX_ADMIN, 10) || 200;
  }

  // Logging
  get LOG_LEVEL() {
    return process.env.LOG_LEVEL || (this.NODE_ENV === 'production' ? 'info' : 'debug');
  }

  get LOG_DIR() {
    return process.env.LOG_DIR || path.join(__dirname, '../../logs');
  }

  // Helpers
  get isProduction() {
    return this.NODE_ENV === 'production';
  }

  get isDevelopment() {
    return this.NODE_ENV === 'development';
  }

  get isTesting() {
    return this.NODE_ENV === 'test';
  }
}

module.exports = new Config();