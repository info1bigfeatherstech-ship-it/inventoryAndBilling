const crypto = require('crypto');
const { getRedisClient } = require('../utils/redis.utils');
const { AppError } = require('./error.middleware');

const DEFAULT_TTL_SECONDS = 60 * 10;

const hashBody = (body) => {
  const json = JSON.stringify(body || {});
  return crypto.createHash('sha256').update(json).digest('hex');
};

const idempotency = (options = {}) => {
  const ttlSeconds = options.ttlSeconds || DEFAULT_TTL_SECONDS;
  const keyHeader = (options.keyHeader || 'idempotency-key').toLowerCase();

  return async (req, res, next) => {
    const idempotencyKey = req.headers[keyHeader];
    if (!idempotencyKey) {
      return next(new AppError('Missing idempotency-key header', 400, 'IDEMPOTENCY_KEY_REQUIRED'));
    }

    const redis = await getRedisClient();
    const scope = req.user?.userId || req.ip || 'anonymous';
    const redisKey = `idem:${scope}:${idempotencyKey}`;
    const bodyHash = hashBody(req.body);

    const existing = await redis.get(redisKey);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed.bodyHash !== bodyHash) {
        return next(new AppError('idempotency-key reused with different payload', 409, 'IDEMPOTENCY_CONFLICT'));
      }

      return res.status(parsed.statusCode).json(parsed.response);
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      const statusCode = res.statusCode || 200;
      redis
        .set(
          redisKey,
          JSON.stringify({
            bodyHash,
            statusCode,
            response: payload,
          }),
          'EX',
          ttlSeconds
        )
        .catch(() => {});

      return originalJson(payload);
    };

    return next();
  };
};

module.exports = {
  idempotency,
};
