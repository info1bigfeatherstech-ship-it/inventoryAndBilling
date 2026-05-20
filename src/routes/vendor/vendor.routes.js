const express = require('express');
const router = express.Router();

const VendorController = require('../../controllers/vendor/vendor.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  createVendorValidator,
  updateVendorValidator,
  listVendorsValidator,
  vendorIdParam,
} = require('../../validators/vendor/vendor.validators');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');

const ADMIN_ONLY = ['SUPER_ADMIN'];
const VENDOR_READ_ROLES = [
  'SUPER_ADMIN',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
  'SHOP_OWNER',
  'SHOP_STOCK_LISTER',
  'BILLING_STAFF',
];

router.use(requireAuth);

router.get('/', authorizeRoles(...VENDOR_READ_ROLES), listVendorsValidator, validateRequest, VendorController.list);
router.get('/:vendorId', authorizeRoles(...VENDOR_READ_ROLES), vendorIdParam, validateRequest, VendorController.getById);

router.post('/', authorizeRoles(...ADMIN_ONLY), createVendorValidator, validateRequest, VendorController.create);
router.put('/:vendorId', authorizeRoles(...ADMIN_ONLY), updateVendorValidator, validateRequest, VendorController.update);
router.delete('/:vendorId', authorizeRoles(...ADMIN_ONLY), vendorIdParam, validateRequest, VendorController.remove);

module.exports = router;
