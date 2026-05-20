const { getRedisClient } = require('./redis.utils');
const logger = require('./logger.utils');
const config = require('../config/index.config');

const DEFAULT_PRODUCT_TTL_SEC = config.PRODUCT_CACHE_TTL_SEC || 300;

const safeParse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const cacheGet = async (key) => {
  try {
    const client = await getRedisClient();
    const raw = await client.get(key);
    if (!raw) return null;
    return safeParse(raw);
  } catch (error) {
    logger.warn('Redis cache get failed — bypassing cache', { key, error: error.message });
    return null;
  }
};

const cacheSet = async (key, value, ttlSec = DEFAULT_PRODUCT_TTL_SEC) => {
  try {
    const client = await getRedisClient();
    await client.set(key, JSON.stringify(value), 'EX', ttlSec);
    return true;
  } catch (error) {
    logger.warn('Redis cache set failed — continuing without cache', { key, error: error.message });
    return false;
  }
};

const cacheDel = async (...keys) => {
  if (!keys.length) return;
  try {
    const client = await getRedisClient();
    await client.del(...keys);
  } catch (error) {
    logger.warn('Redis cache delete failed', { keys, error: error.message });
  }
};

const cacheDelByPattern = async (pattern) => {
  try {
    const client = await getRedisClient();
    let cursor = '0';
    do {
      const [nextCursor, matchedKeys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (matchedKeys.length) await client.del(...matchedKeys);
    } while (cursor !== '0');
  } catch (error) {
    logger.warn('Redis cache pattern delete failed', { pattern, error: error.message });
  }
};

const productDetailCacheKey = (productId) => `product:detail:${productId}`;
const productListCachePattern = (warehouseId) => `product:list:${warehouseId}:*`;

module.exports = {
  DEFAULT_PRODUCT_TTL_SEC,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelByPattern,
  productDetailCacheKey,
  productListCachePattern,
};
