const Redis = require('ioredis');
const prisma = require('../utils/prisma.utils');
const config = require('../config/index.config');

class ConnectivityService {
  async checkDatabase() {
    const startedAt = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        name: 'database',
        status: 'up',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: error.message,
      };
    }
  }

  async checkRedis() {
    const startedAt = Date.now();

    if (!config.REDIS_HOST) {
      return {
        name: 'redis',
        status: 'not_configured',
      };
    }

    let client = null;
    try {
      client = new Redis({
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        connectTimeout: 1500,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });

      await client.connect();
      await client.ping();

      return {
        name: 'redis',
        status: 'up',
        latencyMs: Date.now() - startedAt,
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'down',
        latencyMs: Date.now() - startedAt,
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        error: error.message,
      };
    } finally {
      if (client) {
        try {
          await client.quit();
        } catch (_) {
          // noop
        }
      }
    }
  }

  checkR2Config() {
    if (!config.R2_ENABLED) {
      return {
        name: 'cloudflare_r2',
        status: 'disabled',
      };
    }

    const missing = [];
    if (!config.R2_ENDPOINT) missing.push('R2_ENDPOINT');
    if (!config.R2_BUCKET) missing.push('R2_BUCKET');
    if (!config.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
    if (!config.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');

    if (missing.length > 0) {
      return {
        name: 'cloudflare_r2',
        status: 'misconfigured',
        missing,
      };
    }

    return {
      name: 'cloudflare_r2',
      status: 'configured',
      bucket: config.R2_BUCKET,
      endpoint: config.R2_ENDPOINT,
    };
  }

  checkCloudinaryConfig() {
    const missing = [];
    if (!config.CLOUDINARY_CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
    if (!config.CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
    if (!config.CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');

    if (missing.length) {
      return { name: 'cloudinary', status: 'misconfigured', missing };
    }

    return { name: 'cloudinary', status: 'configured', cloud_name: config.CLOUDINARY_CLOUD_NAME };
  }

  async getSnapshot() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const MediaService = require('./storage/media.service');

    return {
      database,
      redis,
      cloudflareR2: this.checkR2Config(),
      cloudinary: this.checkCloudinaryConfig(),
      media: MediaService.getMediaStatus(),
    };
  }
}

module.exports = new ConnectivityService();
