const express = require('express');
const router = express.Router();

const VendorController = require('../../controllers/vendor.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  createVendorValidator,
  updateVendorValidator,
  listVendorsValidator,
  vendorIdParam,
} = require('../../validators/vendor.validators');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');

router.use(requireAuth);
router.use(authorizeRoles('SUPER_ADMIN'));

router.post('/', createVendorValidator, validateRequest, VendorController.create);
router.get('/', listVendorsValidator, validateRequest, VendorController.list);
router.get('/:vendorId', vendorIdParam, validateRequest, VendorController.getById);
router.put('/:vendorId', updateVendorValidator, validateRequest, VendorController.update);
router.delete('/:vendorId', vendorIdParam, validateRequest, VendorController.remove);

module.exports = router;

