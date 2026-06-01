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
  body(`${prefix}special_price`).optional().isFloat({ min: 0 }),
  body(`${prefix}purchase_price`).optional().isFloat({ min: 0 }),
  body(`${prefix}purchase_cost`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}expenses`).optional().isFloat({ min: 0 }),
];

const variantShippingRules = (prefix = '') => [
  body(`${prefix}weight`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}weight_per_unit`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}length`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}width`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}height`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}shipping.weight`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}shipping.dimensions.length`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}shipping.dimensions.width`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}shipping.dimensions.height`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}dimensions.length`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}dimensions.width`).optional({ nullable: true }).isFloat({ min: 0 }),
  body(`${prefix}dimensions.height`).optional({ nullable: true }).isFloat({ min: 0 }),
];

const variantBodyRules = (prefix = 'variants.*.') => [
  body(`${prefix}sku`).optional().isString().trim().isLength({ min: 1, max: 80 }),
  body(`${prefix}system_barcode`).optional().isString().trim().isLength({ min: 1, max: 80 }),
  body(`${prefix}vendor_barcode`).optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  ...productPriceRules(prefix),
  ...variantShippingRules(prefix),
  body(`${prefix}low_stock_threshold`).optional().isInt({ min: 0 }),
  body(`${prefix}attributes`).optional(),
  body(`${prefix}is_active`).optional().isBoolean().toBoolean(),
];

const requirePriceWhenNoVariants = (field, label) =>
  body(field)
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const hasVariants = Array.isArray(req.body.variants) && req.body.variants.length > 0;
      if (!hasVariants && (value === undefined || value === null || value === '')) {
        throw new Error(`${label} is required when variants array is not provided`);
      }
      if (value !== undefined && value !== null && value !== '') {
        const n = Number(value);
        if (Number.isNaN(n) || n < 0) throw new Error(`${label} must be a non-negative number`);
      }
      return true;
    });

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
  ...variantShippingRules(''),
  body('category_id').isString().trim().notEmpty(),
  body('sub_category_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  requirePriceWhenNoVariants('mrp', 'mrp'),
  requirePriceWhenNoVariants('special_price', 'special_price'),
  requirePriceWhenNoVariants('expenses', 'expenses'),
  body().custom((_, { req }) => {
    const hasVariants = Array.isArray(req.body.variants) && req.body.variants.length > 0;
    if (hasVariants) return true;
    const hasPurchase =
      (req.body.purchase_price != null && req.body.purchase_price !== '') ||
      (req.body.purchase_cost != null && req.body.purchase_cost !== '');
    if (!hasPurchase) {
      throw new Error('purchase_price (or purchase_cost) is required when variants array is not provided');
    }
    return true;
  }),
  body('purchase_cost').optional({ nullable: true }).isFloat({ min: 0 }),
  body('system_barcode').optional().isString().trim().notEmpty(),
  body('vendor_barcode').optional({ nullable: true }).isString().trim(),
  body('variants')
    .optional()
    .isArray()
    .custom((variants) => {
      if (!variants || !variants.length) return true;
      variants.forEach((v, i) => {
        for (const key of ['mrp', 'special_price', 'purchase_price', 'expenses']) {
          const hasPurchaseAlias = key === 'purchase_price' && v.purchase_cost != null && v.purchase_cost !== '';
          if ((v[key] === undefined || v[key] === null || v[key] === '') && !hasPurchaseAlias) {
            throw new Error(`variants[${i}].${key} is required — each variant needs its own price`);
          }
        }
        const hasWeight =
          (v.weight != null && v.weight !== '') ||
          (v.weight_per_unit != null && v.weight_per_unit !== '') ||
          (v.shipping?.weight != null && v.shipping?.weight !== '');
        const hasLength =
          (v.length != null && v.length !== '') ||
          (v.shipping?.dimensions?.length != null && v.shipping?.dimensions?.length !== '') ||
          (v.dimensions?.length != null && v.dimensions?.length !== '');
        const hasWidth =
          (v.width != null && v.width !== '') ||
          (v.shipping?.dimensions?.width != null && v.shipping?.dimensions?.width !== '') ||
          (v.dimensions?.width != null && v.dimensions?.width !== '');
        const hasHeight =
          (v.height != null && v.height !== '') ||
          (v.shipping?.dimensions?.height != null && v.shipping?.dimensions?.height !== '') ||
          (v.dimensions?.height != null && v.dimensions?.height !== '');
        if (!hasWeight || !hasLength || !hasWidth || !hasHeight) {
          throw new Error(
            `variants[${i}] must include weight, length, width, height (flat or shipping.dimensions) for each variant`
          );
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
  body('special_price').isFloat({ min: 0 }),
  body('purchase_price').optional().isFloat({ min: 0 }),
  body('purchase_cost').optional({ nullable: true }).isFloat({ min: 0 }),
  body('expenses').isFloat({ min: 0 }),
  body().custom((_, { req }) => {
    const hasPurchase =
      (req.body.purchase_price != null && req.body.purchase_price !== '') ||
      (req.body.purchase_cost != null && req.body.purchase_cost !== '');
    if (!hasPurchase) throw new Error('purchase_price or purchase_cost is required');
    return true;
  }),
  body('weight').isFloat({ min: 0 }),
  body('length').isFloat({ min: 0 }),
  body('width').isFloat({ min: 0 }),
  body('height').isFloat({ min: 0 }),
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
