const crypto = require('crypto');
const { AppError } = require('../../errors/AppError');
const { getRedisClient } = require('../../utils/redis.utils');
const { resolveSyncShopId } = require('./syncAccess.utils');
const {
  SYNC_ENTITY_TYPES,
  SYNC_IDEMPOTENCY_TTL_SECONDS,
  SYNC_PUSH_RESULT_STATUS,
} = require('./sync.constants');
const logger = require('../../utils/logger.utils');

/** @type {Map<string, (ctx: object) => Promise<object>>} */
const entityHandlers = new Map();

const hashPayload = (payload) =>
  crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');

/** HTTP 409 and known codes are surfaced as conflict (staff must resolve, not blind retry). */
const CONFLICT_ERROR_CODES = new Set([
  'IDEMPOTENCY_PAYLOAD_MISMATCH',
  'OFFLINE_CUSTOMER_NOT_SYNCED',
  'INSUFFICIENT_STOCK',
  'STOCK_SNAPSHOT_MISMATCH',
  'DUPLICATE_MOBILE',
  'SHOP_MISMATCH',
]);

const classifyPushFailure = (err) => {
  const httpStatus = err.statusCode || 500;
  const errorCode = err.code || 'SYNC_APPLY_FAILED';
  const isConflict = httpStatus === 409 || CONFLICT_ERROR_CODES.has(errorCode);
  return {
    isConflict,
    errorCode,
    httpStatus,
    message: err.message || 'Failed to apply offline mutation',
    errorDetails: err.details ?? null,
  };
};

const buildIdempotencyRedisKey = (userId, clientId) => `sync:idem:${userId}:${clientId}`;

const validateOutboxItem = (item, index) => {
  const prefix = `items[${index}]`;

  if (!item || typeof item !== 'object') {
    throw new AppError(`${prefix} must be an object`, 400, 'INVALID_SYNC_ITEM');
  }

  if (!item.client_id || typeof item.client_id !== 'string') {
    throw new AppError(`${prefix}.client_id is required`, 400, 'CLIENT_ID_REQUIRED');
  }

  if (!item.entity_type || !SYNC_ENTITY_TYPES.includes(item.entity_type)) {
    throw new AppError(
      `${prefix}.entity_type must be one of: ${SYNC_ENTITY_TYPES.join(', ')}`,
      400,
      'INVALID_ENTITY_TYPE'
    );
  }

  if (!item.idempotency_key || typeof item.idempotency_key !== 'string') {
    throw new AppError(`${prefix}.idempotency_key is required`, 400, 'IDEMPOTENCY_KEY_REQUIRED');
  }

  if (!item.payload || typeof item.payload !== 'object') {
    throw new AppError(`${prefix}.payload is required`, 400, 'PAYLOAD_REQUIRED');
  }

  if (item.offline_created_at && Number.isNaN(new Date(item.offline_created_at).getTime())) {
    throw new AppError(`${prefix}.offline_created_at must be ISO-8601`, 400, 'INVALID_OFFLINE_CREATED_AT');
  }
};

const registerSyncHandler = (entityType, handler) => {
  if (!SYNC_ENTITY_TYPES.includes(entityType)) {
    throw new Error(`Unknown sync entity type: ${entityType}`);
  }
  entityHandlers.set(entityType, handler);
};

const processOutboxItem = async ({ item, user, shopId, redis, batchContext }) => {
  const redisKey = buildIdempotencyRedisKey(user.userId, item.client_id);
  const payloadHash = hashPayload(item.payload);

  const cached = await redis.get(redisKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed.payloadHash !== payloadHash) {
      return {
        client_id: item.client_id,
        entity_type: item.entity_type,
        status: SYNC_PUSH_RESULT_STATUS.CONFLICT,
        error_code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        message: 'client_id reused with different payload',
        http_status: 409,
        error_details: null,
      };
    }

    return {
      client_id: item.client_id,
      entity_type: item.entity_type,
      status: SYNC_PUSH_RESULT_STATUS.DUPLICATE,
      server_id: parsed.serverId ?? null,
      server_response: parsed.response ?? null,
    };
  }

  const handler = entityHandlers.get(item.entity_type);
  if (!handler) {
    return {
      client_id: item.client_id,
      entity_type: item.entity_type,
      status: SYNC_PUSH_RESULT_STATUS.DEFERRED,
      error_code: 'HANDLER_NOT_READY',
      message: `Sync handler for "${item.entity_type}" is not yet enabled on the server`,
    };
  }

  try {
    const result = await handler({
      item,
      user,
      shopId,
      batchContext,
    });

    const responsePayload = {
      server_id: result?.server_id ?? null,
      data: result?.data ?? null,
    };

    batchContext.set(item.client_id, responsePayload);

    await redis.set(
      redisKey,
      JSON.stringify({
        payloadHash,
        serverId: result?.server_id ?? null,
        response: responsePayload,
        storedAt: new Date().toISOString(),
      }),
      'EX',
      SYNC_IDEMPOTENCY_TTL_SECONDS
    );

    return {
      client_id: item.client_id,
      entity_type: item.entity_type,
      status: SYNC_PUSH_RESULT_STATUS.APPLIED,
      server_id: result?.server_id ?? null,
      server_response: responsePayload,
    };
  } catch (err) {
    const failure = classifyPushFailure(err);

    logger.warn('sync push item failed', {
      client_id: item.client_id,
      entity_type: item.entity_type,
      error: failure.message,
      code: failure.errorCode,
      conflict: failure.isConflict,
    });

    return {
      client_id: item.client_id,
      entity_type: item.entity_type,
      status: failure.isConflict
        ? SYNC_PUSH_RESULT_STATUS.CONFLICT
        : SYNC_PUSH_RESULT_STATUS.ERROR,
      error_code: failure.errorCode,
      message: failure.message,
      http_status: failure.httpStatus,
      error_details: failure.errorDetails,
    };
  }
};

const SyncPushService = {
  registerSyncHandler,

  /**
   * Apply a batch of offline outbox mutations (idempotent per client_id).
   */
  async push(body, user) {
    const shopId = await resolveSyncShopId(user, body.shop_id);
    const items = body.items;

    if (!Array.isArray(items)) {
      throw new AppError('items must be an array', 400, 'ITEMS_REQUIRED');
    }

    if (!items.length) {
      return {
        shop_id: shopId,
        processed: 0,
        results: [],
      };
    }

    if (items.length > 100) {
      throw new AppError('Maximum 100 sync items per batch', 400, 'BATCH_TOO_LARGE');
    }

    items.forEach(validateOutboxItem);

    const clientIds = items.map((i) => i.client_id);
    if (new Set(clientIds).size !== clientIds.length) {
      throw new AppError('Duplicate client_id in batch', 400, 'DUPLICATE_CLIENT_ID');
    }

    const redis = await getRedisClient();
    const results = [];
    const batchContext = new Map();

    for (const item of items) {
      if (item.shop_id && item.shop_id !== shopId) {
        results.push({
          client_id: item.client_id,
          entity_type: item.entity_type,
          status: SYNC_PUSH_RESULT_STATUS.CONFLICT,
          error_code: 'SHOP_MISMATCH',
          message: 'Outbox item shop_id does not match sync context',
          http_status: 409,
          error_details: { expected_shop_id: shopId, item_shop_id: item.shop_id },
        });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const result = await processOutboxItem({ item, user, shopId, redis, batchContext });
      results.push(result);
    }

    return {
      shop_id: shopId,
      processed: results.length,
      results,
    };
  },

  /** Exposed for unit tests and future handler registration modules. */
  _entityHandlers: entityHandlers,
};

module.exports = SyncPushService;
