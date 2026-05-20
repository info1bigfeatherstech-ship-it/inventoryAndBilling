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

const READ_ROLES = [
  'SUPER_ADMIN',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
  'SHOP_OWNER',
  'SHOP_STOCK_LISTER',
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

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Invalid image type'), ok);
  },
});

router.use(requireAuth);

router.get('/', authorizeRoles(...READ_ROLES), listProductsValidator, validateRequest, ProductController.list);

router.post(
  '/bulk/csv',
  authorizeRoles(...WRITE_ROLES),
  csvUpload.single('file'),
  bulkCsvValidator,
  validateRequest,
  ProductController.bulkCreateCsv
);
router.patch('/bulk', authorizeRoles(...WRITE_ROLES), bulkUpdateValidator, validateRequest, ProductController.bulkUpdate);
router.delete('/bulk', authorizeRoles(...WRITE_ROLES), bulkDeleteValidator, validateRequest, ProductController.bulkDelete);

router.get('/:productId', authorizeRoles(...READ_ROLES), productIdParam, validateRequest, ProductController.getById);
router.post('/', authorizeRoles(...WRITE_ROLES), createProductValidator, validateRequest, ProductController.create);
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
  imageUpload.array('images', 4),
  validateRequest,
  ProductController.uploadVariantImages
);
router.put(
  '/:productId/variants/:variantId/images',
  authorizeRoles(...WRITE_ROLES),
  productIdParam,
  variantIdParam,
  imageUpload.array('images', 4),
  syncVariantImagesValidator,
  validateRequest,
  ProductController.syncVariantImages
);

module.exports = router;
