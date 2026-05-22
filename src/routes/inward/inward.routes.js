const express = require('express');
const router = express.Router();

const InwardController = require('../../controllers/inward/inward.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth, authorizeRoles } = require('../../middlewares/auth.middleware');
const {
  inwardIdParam,
  inwardItemIdParam,
  createInwardValidator,
  updateArrivalDetailsValidator,
  addInwardItemValidator,
  updateInwardItemValidator,
  updateInwardStatusValidator,
  listInwardsValidator,
  bulkAddInwardItemsValidator,
} = require('../../validators/inward/inward.validators');

router.use(requireAuth);
router.use(authorizeRoles('SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'));

router.post('/', createInwardValidator, validateRequest, InwardController.create);
router.get('/', listInwardsValidator, validateRequest, InwardController.list);
router.get('/:inwardId', inwardIdParam, validateRequest, InwardController.getById);
router.patch('/:inwardId/arrival-details', updateArrivalDetailsValidator, validateRequest, InwardController.updateArrivalDetails);
router.post('/:inwardId/items/bulk',bulkAddInwardItemsValidator,validateRequest,InwardController.addBulkItems);
router.post('/:inwardId/items', addInwardItemValidator, validateRequest, InwardController.addItem);
router.put('/:inwardId/items/:inwardItemId', updateInwardItemValidator, validateRequest, InwardController.updateItem);
router.delete('/:inwardId/items/:inwardItemId', inwardItemIdParam, validateRequest, InwardController.removeItem);
router.patch('/:inwardId/status', updateInwardStatusValidator, validateRequest, InwardController.updateStatus);

module.exports = router;
