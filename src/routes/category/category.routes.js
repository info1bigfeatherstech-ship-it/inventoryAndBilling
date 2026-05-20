const express = require('express');
const router = express.Router();

const CategoryController = require('../../controllers/category/category.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  categoryIdParam,
  createCategoryValidator,
  updateCategoryValidator,
  listCategoriesValidator,
} = require('../../validators/category/category.validators');

const READ_ROLES = [
  'SUPER_ADMIN',
  'WH_MANAGER',
  'WH_STOCK_LISTER',
  'SHOP_OWNER',
  'SHOP_STOCK_LISTER',
  'BILLING_STAFF',
];

const WRITE_ROLES = ['SUPER_ADMIN', 'WH_MANAGER'];

router.use(requireAuth);

router.get('/', authorizeRoles(...READ_ROLES), listCategoriesValidator, validateRequest, CategoryController.list);
router.get('/:categoryId', authorizeRoles(...READ_ROLES), categoryIdParam, validateRequest, CategoryController.getById);

router.post('/', authorizeRoles(...WRITE_ROLES), createCategoryValidator, validateRequest, CategoryController.create);
router.put('/:categoryId', authorizeRoles(...WRITE_ROLES), updateCategoryValidator, validateRequest, CategoryController.update);
router.delete('/:categoryId', authorizeRoles(...WRITE_ROLES), categoryIdParam, validateRequest, CategoryController.remove);

module.exports = router;
