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

router.use(requireAuth);
router.use(authorizeRoles('SUPER_ADMIN'));

router.post('/', createWarehouseValidator, validateRequest, WarehouseController.create);
router.get('/', listWarehousesValidator, validateRequest, WarehouseController.list);
router.get('/:warehouseId', warehouseIdParam, validateRequest, WarehouseController.getById);
router.put('/:warehouseId', updateWarehouseValidator, validateRequest, WarehouseController.update);
router.delete('/:warehouseId', warehouseIdParam, validateRequest, WarehouseController.remove);

module.exports = router;
