// backend/src/services/health.service.js
const prisma = require('../utils/prisma.utils');
const logger = require('../utils/logger.utils');
const config = require('../config/index.config');
const connectivityService = require('./connectivity.service');

class HealthService {
  constructor() {
    this.startTime = Date.now();
  }

  async checkDatabase() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latency: null };
    } catch (error) {
      logger.error('Database health check failed:', error.message);
      return { status: 'down', error: error.message };
    }
  }

  async checkRedis() {
    const redis = await connectivityService.checkRedis();
    return {
      status: redis.status,
      latencyMs: redis.latencyMs || null,
      ...(redis.error ? { error: redis.error } : {}),
    };
  }

  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    };
  }

  async getFullHealth(reqId = null) {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const isHealthy = database.status === 'up';
    const status = isHealthy ? 'healthy' : 'unhealthy';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      requestId: reqId,
      environment: config.NODE_ENV,
      services: {
        database,
        redis,
      },
      memory: this.getMemoryUsage(),
    };
  }

  getLiveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const database = await this.checkDatabase();
    const isReady = database.status === 'up';
    
    return {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: { database },
    };
  }
}

module.exports = new HealthService();