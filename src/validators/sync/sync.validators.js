const { query, body } = require('express-validator');
const { SYNC_ENTITY_TYPES, SYNC_PULL_SECTIONS } = require('../../services/sync/sync.constants');

const pullSyncValidator = [
  query('shop_id').optional().isString().trim().notEmpty(),
  query('sections')
    .optional()
    .isString()
    .trim()
    .custom((value) => {
      const parts = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const invalid = parts.filter((p) => !SYNC_PULL_SECTIONS.includes(p));
      if (invalid.length) {
        throw new Error(`Invalid sections: ${invalid.join(', ')}`);
      }
      return true;
    }),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('since').optional().isISO8601(),
  query('stocks_cursor').optional().isString().trim().notEmpty(),
  query('customers_cursor').optional().isString().trim().notEmpty(),
];

const pushSyncValidator = [
  body('shop_id').optional().isString().trim().notEmpty(),
  body('items').isArray({ min: 0, max: 100 }),
  body('items.*.client_id').isString().trim().notEmpty(),
  body('items.*.entity_type').isIn([...SYNC_ENTITY_TYPES]),
  body('items.*.idempotency_key').isString().trim().notEmpty(),
  body('items.*.payload').isObject(),
  body('items.*.shop_id').optional().isString().trim().notEmpty(),
  body('items.*.stock_mutated_locally').optional().isBoolean(),
  body('items.*.offline_created_at').optional().isISO8601(),
  body('items.*.client_sequence').optional().isInt({ min: 0 }),
];

const statusSyncValidator = [
  query('shop_id').optional().isString().trim().notEmpty(),
];

module.exports = {
  pullSyncValidator,
  pushSyncValidator,
  statusSyncValidator,
};
