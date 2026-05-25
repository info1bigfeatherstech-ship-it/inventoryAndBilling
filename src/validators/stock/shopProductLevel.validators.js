const { body, query } = require('express-validator');

const setProductLevelsValidator = [
  body('shop_id').optional().isString().trim().notEmpty(),
  body('items').isArray({ min: 1, max: 100 }),
  body('items.*.variant_id').isString().trim().notEmpty(),
  body('items.*.min_level').isInt({ min: 0 }),
  body('items.*.max_level').isInt({ min: 0 }),
  body('items.*.reorder_qty').optional({ nullable: true }).isInt({ min: 1 }),
];

const reorderSuggestionsValidator = [
  query('shop_id').optional().isString().trim().notEmpty(),
  query('warehouse_id').optional().isString().trim().notEmpty(),
];

module.exports = {
  setProductLevelsValidator,
  reorderSuggestionsValidator,
};
