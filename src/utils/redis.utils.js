const Redis = require('ioredis');
const config = require('../config/index.config');
const logger = require('./logger.utils');

let redisClient = null;
let connecting = null;

const getRedisConfig = () => ({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
  enableReadyCheck: true,
  maxRetriesPerRequest: 2,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 5) return null;
    return Math.min(times * 200, 2000);
  },
});

const createRedisClient = async () => {
  if (redisClient) return redisClient;
  if (connecting) return connecting;

  connecting = (async () => {
    const client = new Redis(getRedisConfig());

    client.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
    });

    client.on('ready', () => {
      logger.info('Redis connected');
    });

    await client.connect();
    redisClient = client;
    connecting = null;
    return redisClient;
  })().catch((error) => {
    connecting = null;
    logger.error('Redis connection failed', { error: error.message });
    throw error;
  });

  return connecting;
};

const getRedisClient = async () => {
  if (redisClient && redisClient.status === 'ready') return redisClient;
  return createRedisClient();
};

const closeRedisClient = async () => {
  if (!redisClient) return;
  await redisClient.quit();
  redisClient = null;
};

module.exports = {
  getRedisClient,
  closeRedisClient,
};
