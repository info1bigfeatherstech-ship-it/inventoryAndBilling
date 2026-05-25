const { query } = require('express-validator');

const stockSearchValidator = [
  query('variant_id').optional().isString().trim().notEmpty(),
  query('product_code').optional().isString().trim().notEmpty(),
  query('sku').optional().isString().trim().notEmpty(),
  query('barcode').optional().isString().trim().notEmpty(),
  query('city').optional().isString().trim(),
  query('nearby_only').optional().isBoolean().toBoolean(),
  query().custom((_, { req }) => {
    const q = req.query;
    if (!q.variant_id && !q.product_code && !q.sku && !q.barcode) {
      throw new Error('Provide at least one of: variant_id, product_code, sku, barcode');
    }
    return true;
  }),
];

module.exports = { stockSearchValidator };
