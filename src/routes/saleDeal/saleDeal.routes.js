const express = require('express');
const router = express.Router();
const SaleDealController = require('../../controllers/saleDeal/saleDeal.controller');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  saleDealIdParam,
  listSaleDealsValidator,
  searchSaleVariantsValidator,
  createSaleDealValidator,
  updateSaleDealValidator,
  setSaleDealActiveValidator,
} = require('../../validators/saleDeal/saleDeal.validators');

const ADMIN = ['SUPER_ADMIN'];

router.use(requireAuth);

router.get(
  '/search-variants',
  authorizeRoles(...ADMIN),
  searchSaleVariantsValidator,
  validateRequest,
  SaleDealController.searchVariants
);

router.get(
  '/',
  authorizeRoles(...ADMIN),
  listSaleDealsValidator,
  validateRequest,
  SaleDealController.list
);

router.get(
  '/:saleDealId',
  authorizeRoles(...ADMIN),
  saleDealIdParam,
  validateRequest,
  SaleDealController.getById
);

router.post(
  '/',
  authorizeRoles(...ADMIN),
  createSaleDealValidator,
  validateRequest,
  SaleDealController.create
);

router.patch(
  '/:saleDealId',
  authorizeRoles(...ADMIN),
  updateSaleDealValidator,
  validateRequest,
  SaleDealController.update
);

router.patch(
  '/:saleDealId/active',
  authorizeRoles(...ADMIN),
  setSaleDealActiveValidator,
  validateRequest,
  SaleDealController.setActive
);

module.exports = router;
