const { body, param, query } = require('express-validator');

const GST_TYPES = ['CGST_SGST', 'IGST', 'EXEMPT'];

const productIdParam = [
  param('productId').isString().trim().notEmpty().withMessage('productId is required'),
];

const variantIdParam = [
  param('variantId').isString().trim().notEmpty().withMessage('variantId is required'),
];

const productPriceRules = (prefix = '') => [
  body(`${prefix}mrp`).optional().isFloat({ min: 0 }),
  body(`${prefix}wholesale_price`).optional().isFloat({ min: 0 }),
  body(`${prefix}retail_price`).optional().isFloat({ min: 0 }),
  body(`${prefix}online_price`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}purchase_cost`).optional({ nullable: true }).isFloat({ min: 0 }),
];

const variantBodyRules = (prefix = 'variants.*.') => [
  body(`${prefix}sku`).optional().isString().trim().isLength({ min: 1, max: 80 }),
  body(`${prefix}system_barcode`).optional().isString().trim().isLength({ min: 1, max: 80 }),
  body(`${prefix}vendor_barcode`).optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  ...productPriceRules(prefix),
  body(`${prefix}low_stock_threshold`).optional().isInt({ min: 0 }),
  body(`${prefix}attributes`).optional(),
  body(`${prefix}is_active`).optional().isBoolean().toBoolean(),
];

const createProductValidator = [
  body('warehouse_id').optional().isString().trim().notEmpty(),
  body('product_code').isString().trim().isLength({ min: 1, max: 80 }),
  body('name').isString().trim().isLength({ min: 2, max: 200 }),
  body('description').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body('title').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('brand_name').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('primary_vendor_id').isString().trim().notEmpty(),
  body('hsn_code').isString().trim().isLength({ min: 4, max: 20 }),
  body('gst_percent').isFloat({ min: 0, max: 100 }),
  body('gst_type').isIn(GST_TYPES),
  body('unit_of_measure').isString().trim().isLength({ min: 1, max: 40 }),
  body('weight_per_unit').optional({ nullable: true }).isFloat({ min: 0 }),
  body('category_id').isString().trim().notEmpty(),
  body('sub_category_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('mrp')
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const hasVariants = Array.isArray(req.body.variants) && req.body.variants.length > 0;
      if (!hasVariants && (value === undefined || value === null || value === '')) {
        throw new Error('mrp is required when variants array is not provided');
      }
      if (value !== undefined && value !== null && value !== '') {
        const n = Number(value);
        if (Number.isNaN(n) || n < 0) throw new Error('mrp must be a non-negative number');
      }
      return true;
    }),
  body('wholesale_price')
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const hasVariants = Array.isArray(req.body.variants) && req.body.variants.length > 0;
      if (!hasVariants && (value === undefined || value === null || value === '')) {
        throw new Error('wholesale_price is required when variants array is not provided');
      }
      return true;
    }),
  body('retail_price')
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const hasVariants = Array.isArray(req.body.variants) && req.body.variants.length > 0;
      if (!hasVariants && (value === undefined || value === null || value === '')) {
        throw new Error('retail_price is required when variants array is not provided');
      }
      return true;
    }),
  body('online_price').optional({ nullable: true }).isFloat({ min: 0 }),
  body('purchase_cost').optional({ nullable: true }).isFloat({ min: 0 }),
  body('system_barcode').optional().isString().trim().notEmpty(),
  body('vendor_barcode').optional({ nullable: true }).isString().trim(),
  body('variants')
    .optional()
    .isArray()
    .custom((variants) => {
      if (!variants || !variants.length) return true;
      variants.forEach((v, i) => {
        for (const key of ['mrp', 'wholesale_price', 'retail_price']) {
          if (v[key] === undefined || v[key] === null || v[key] === '') {
            throw new Error(`variants[${i}].${key} is required — each variant needs its own price`);
          }
        }
      });
      return true;
    }),
  ...variantBodyRules('variants.*.'),
];

const updateProductValidator = [
  ...productIdParam,
  body('name').optional().isString().trim().isLength({ min: 2, max: 200 }),
  body('description').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body('title').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('brand_name').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('primary_vendor_id').optional().isString().trim().notEmpty(),
  body('hsn_code').optional().isString().trim().isLength({ min: 4, max: 20 }),
  body('gst_percent').optional().isFloat({ min: 0, max: 100 }),
  body('gst_type').optional().isIn(GST_TYPES),
  body('unit_of_measure').optional().isString().trim().isLength({ min: 1, max: 40 }),
  body('weight_per_unit').optional({ nullable: true }).isFloat({ min: 0 }),
  body('category_id').optional().isString().trim().notEmpty(),
  body('sub_category_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('is_active').optional().isBoolean().toBoolean(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  ...productPriceRules(''),
  body('apply_prices_to_variants').optional().isBoolean().toBoolean(),
];

const createVariantValidator = [
  ...productIdParam,
  body('system_barcode').optional().isString().trim().notEmpty(),
  body('vendor_barcode').optional({ nullable: true }).isString().trim(),
  body('mrp').isFloat({ min: 0 }),
  body('wholesale_price').isFloat({ min: 0 }),
  body('retail_price').isFloat({ min: 0 }),
  body('online_price').optional({ nullable: true }).isFloat({ min: 0 }),
  body('purchase_cost').optional({ nullable: true }).isFloat({ min: 0 }),
  ...variantBodyRules(''),
];

const updateVariantValidator = [
  ...productIdParam,
  ...variantIdParam,
  body('sku').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('system_barcode').optional().isString().trim().notEmpty(),
  ...productPriceRules(''),
  ...variantBodyRules(''),
];

const syncVariantImagesValidator = [
  body('keep_image_ids')
    .optional()
    .custom((value) => {
      if (value === undefined || value === null || value === '') return true;
      if (Array.isArray(value)) return true;
      if (typeof value === 'string') return true;
      throw new Error('keep_image_ids must be an array or JSON string');
    }),
];

const listProductsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
  query('is_active').optional().isBoolean().toBoolean(),
  query('include_inactive').optional().isBoolean().toBoolean(),
  query('category_id').optional().isString().trim().notEmpty(),
  query('sub_category_id').optional().isString().trim().notEmpty(),
  query('primary_vendor_id').optional().isString().trim().notEmpty(),
  query('warehouse_id').optional().isString().trim().notEmpty(),
];

const bulkUpdateValidator = [
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').isString().trim().notEmpty(),
  body('items.*.variant_id').optional().isString().trim().notEmpty(),
];

const bulkDeleteValidator = [
  body('product_ids').isArray({ min: 1 }),
  body('product_ids.*').isString().trim().notEmpty(),
];

const bulkCsvValidator = [
  body('warehouse_id').optional().isString().trim().notEmpty(),
  query('warehouse_id').optional().isString().trim().notEmpty(),
];

module.exports = {
  productIdParam,
  variantIdParam,
  createProductValidator,
  updateProductValidator,
  createVariantValidator,
  updateVariantValidator,
  syncVariantImagesValidator,
  listProductsValidator,
  bulkUpdateValidator,
  bulkDeleteValidator,
  bulkCsvValidator,
};
