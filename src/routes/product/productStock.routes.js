const express = require('express');
const multer = require('multer');
const router = express.Router();

const ProductStockController = require('../../controllers/product/productStock.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  stockIdParam,
  createStockValidator,
  updateStockValidator,
  listStockValidator,
  bulkStockUpdateValidator,
  bulkStockDeleteValidator,
  bulkStockCsvValidator,
} = require('../../validators/product/productStock.validators');

const READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_OWNER', 'SHOP_STOCK_LISTER', 'BILLING_STAFF'];
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

router.use(requireAuth);

router.get('/', authorizeRoles(...READ_ROLES), listStockValidator, validateRequest, ProductStockController.list);
router.post('/', authorizeRoles(...WRITE_ROLES), createStockValidator, validateRequest, ProductStockController.create);

router.post(
  '/bulk/csv',
  authorizeRoles(...WRITE_ROLES),
  csvUpload.single('file'),
  bulkStockCsvValidator,
  validateRequest,
  ProductStockController.bulkCreateCsv
);
router.patch('/bulk', authorizeRoles(...WRITE_ROLES), bulkStockUpdateValidator, validateRequest, ProductStockController.bulkUpdate);
router.delete('/bulk', authorizeRoles(...WRITE_ROLES), bulkStockDeleteValidator, validateRequest, ProductStockController.bulkDelete);

router.get('/:stockId', authorizeRoles(...READ_ROLES), stockIdParam, validateRequest, ProductStockController.getById);
router.put('/:stockId', authorizeRoles(...WRITE_ROLES), updateStockValidator, validateRequest, ProductStockController.update);
router.delete('/:stockId', authorizeRoles(...WRITE_ROLES), stockIdParam, validateRequest, ProductStockController.remove);

module.exports = router;
