const express = require('express');
const router = express.Router();

const CustomerController = require('../../controllers/customer/customer.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  customerIdParam,
  createCustomerValidator,
  updateCustomerValidator,
  listCustomersValidator,
  searchCustomersValidator,
  updateLoyaltyTier,
} = require('../../validators/customer/customer.validators');

const WRITE_ROLES = ['SUPER_ADMIN', 'SHOP_OWNER', 'BILLING_STAFF'];

router.use(requireAuth);

router.post('/', authorizeRoles(...WRITE_ROLES), createCustomerValidator, validateRequest, CustomerController.create);
router.get('/search', searchCustomersValidator, validateRequest, CustomerController.search);
router.get('/', listCustomersValidator, validateRequest, CustomerController.list);
router.get('/:customerId/bills', customerIdParam, validateRequest, CustomerController.getBills);
// Add this with other routes
router.patch(
  '/:customerId/loyalty-tier',
  authorizeRoles('SUPER_ADMIN'),  // Only Super Admin
  updateLoyaltyTier,
  validateRequest,
  CustomerController.updateLoyaltyTier
);
router.get('/:customerId', customerIdParam, validateRequest, CustomerController.getById);
router.put('/:customerId', authorizeRoles(...WRITE_ROLES), updateCustomerValidator, validateRequest, CustomerController.update);
router.delete('/:customerId', authorizeRoles(...WRITE_ROLES), customerIdParam, validateRequest, CustomerController.remove);

module.exports = router;
