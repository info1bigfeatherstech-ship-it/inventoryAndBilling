const express = require('express');
const router = express.Router();

const WarehouseController = require('../../controllers/warehouse/warehouse.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  createWarehouseValidator,
  updateWarehouseValidator,
  listWarehousesValidator,
  warehouseIdParam,
} = require('../../validators/warehouse/warehouse.validators');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');

const ADMIN_ONLY = ['SUPER_ADMIN'];
const WAREHOUSE_READ_ROLES = ['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER', 'SHOP_OWNER', 'SHOP_STOCK_LISTER'];

router.use(requireAuth);

router.get(
  '/peer-stock-summary',
  authorizeRoles(...WAREHOUSE_READ_ROLES),
  WarehouseController.peerStockSummary
);

router.get('/', authorizeRoles(...WAREHOUSE_READ_ROLES), listWarehousesValidator, validateRequest, WarehouseController.list);
router.get('/:warehouseId', authorizeRoles(...WAREHOUSE_READ_ROLES), warehouseIdParam, validateRequest, WarehouseController.getById);

router.post('/', authorizeRoles(...ADMIN_ONLY), createWarehouseValidator, validateRequest, WarehouseController.create);
router.put(
  '/:warehouseId',
  authorizeRoles(...ADMIN_ONLY),
  updateWarehouseValidator,
  validateRequest,
  WarehouseController.update
);
router.delete('/:warehouseId', authorizeRoles(...ADMIN_ONLY), warehouseIdParam, validateRequest, WarehouseController.remove);

module.exports = router;
