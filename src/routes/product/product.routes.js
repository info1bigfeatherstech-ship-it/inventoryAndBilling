const express = require('express');
const multer = require('multer');
const router = express.Router();

const ProductController = require('../../controllers/product/product.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  productIdParam,
  variantIdParam,
  createProductValidator,
  updateProductValidator,
  listProductsValidator,
  bulkUpdateValidator,
  bulkDeleteValidator,
  bulkCsvValidator,
  updateVariantValidator,
  createVariantValidator,
  syncVariantImagesValidator,
} = require('../../validators/product/product.validators');
const { middlewareParseProductJsonBody } = require('../../utils/productMultipart.utils');

/** Multer must forward errors to the global handler (clear 400 messages). */
const runUpload = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

const READ_ROLES = [
  'SUPER_ADMIN',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
  'SHOP_OWNER',
  'SHOP_MANAGER',
  'BILLING_STAFF',
];

const WRITE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'];

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv');
    cb(ok ? null : new Error('Only CSV files are allowed'), ok);
  },
});

const bulkFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
}).fields([
  { name: 'file', maxCount: 1 },      // CSV file
  { name: 'imagesZip', maxCount: 1 }  // ZIP file
]);

const imageMimeFilter = (_req, file, cb) => {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
  cb(ok ? null : new Error('Invalid image type'), ok);
};

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: imageMimeFilter,
});

/** Product/variant create with per-variant images (max 4 images × 8 variants). */
const productMultipartUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 32 },
  fileFilter: imageMimeFilter,
}).any();

router.use(requireAuth);

router.get('/', authorizeRoles(...READ_ROLES), listProductsValidator, validateRequest, ProductController.list);

router.get(
  '/inactive',
  authorizeRoles(...READ_ROLES),  // SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER, SHOP_OWNER, etc.
  listProductsValidator,
  validateRequest,
  ProductController.listInactive
);

router.post(
  '/bulk/csv',
  authorizeRoles(...WRITE_ROLES),
  bulkFileUpload,
  bulkCsvValidator,
  validateRequest,
  ProductController.bulkCreateCsv
);
router.get(
  '/bulk/template',
  authorizeRoles(...READ_ROLES),
  ProductController.bulkDownloadTemplate
);
router.patch('/bulk', authorizeRoles(...WRITE_ROLES), bulkUpdateValidator, validateRequest, ProductController.bulkUpdate);
router.delete('/bulk', authorizeRoles(...WRITE_ROLES), bulkDeleteValidator, validateRequest, ProductController.bulkDelete);

// Bulk restore (activate multiple soft-deleted products)
router.patch('/bulk/restore', authorizeRoles(...WRITE_ROLES), ProductController.bulkRestore);


router.delete('/hard-delete-by-date', authorizeRoles('SUPER_ADMIN'), ProductController.hardDeleteByDate);

router.get('/by-barcode/:barcode',authorizeRoles(...READ_ROLES), ProductController.getByBarcode);

router.get('/:productId', authorizeRoles(...READ_ROLES), productIdParam, validateRequest, ProductController.getById);

// Restore single product
router.patch('/:productId/restore', authorizeRoles(...WRITE_ROLES), productIdParam, validateRequest, ProductController.restore);



router.post(
  '/',
  authorizeRoles(...WRITE_ROLES),
  runUpload(productMultipartUpload),
  middlewareParseProductJsonBody,
  createProductValidator,
  validateRequest,
  ProductController.create
);
router.patch(
  '/:productId',
  authorizeRoles(...WRITE_ROLES),
  updateProductValidator,
  validateRequest,
  ProductController.update
);
router.put('/:productId', authorizeRoles(...WRITE_ROLES), updateProductValidator, validateRequest, ProductController.update);
router.delete('/:productId', authorizeRoles(...WRITE_ROLES), productIdParam, validateRequest, ProductController.remove);

router.post(
  '/:productId/variants',
  authorizeRoles(...WRITE_ROLES),
  productIdParam,
  runUpload(productMultipartUpload),
  middlewareParseProductJsonBody,
  createVariantValidator,
  validateRequest,
  ProductController.createVariant
);
router.patch(
  '/:productId/variants/:variantId',
  authorizeRoles(...WRITE_ROLES),
  updateVariantValidator,
  validateRequest,
  ProductController.updateVariant
);
router.put(
  '/:productId/variants/:variantId',
  authorizeRoles(...WRITE_ROLES),
  updateVariantValidator,
  validateRequest,
  ProductController.updateVariant
);

router.post(
  '/:productId/variants/:variantId/images',
  authorizeRoles(...WRITE_ROLES),
  productIdParam,
  variantIdParam,
  runUpload(imageUpload.array('images', 4)),
  validateRequest,
  ProductController.uploadVariantImages
);
router.put(
  '/:productId/variants/:variantId/images',
  authorizeRoles(...WRITE_ROLES),
  productIdParam,
  variantIdParam,
  runUpload(imageUpload.array('images', 4)),
  syncVariantImagesValidator,
  validateRequest,
  ProductController.syncVariantImages
);

module.exports = router;
