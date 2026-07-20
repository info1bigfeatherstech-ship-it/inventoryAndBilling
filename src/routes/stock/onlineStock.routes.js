const express = require('express');
const router = express.Router();

const OnlineStockController = require('../../controllers/stock/onlineStock.controller');
const { requireInternalStockApiKey } = require('../../middlewares/internalApiKey.middleware');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  batchStockValidator,
  reserveStockValidator,
  releaseStockValidator,
  commitStockValidator,
} = require('../../validators/stock/onlineStock.validators');

router.use(requireInternalStockApiKey);

/**
 * POST /api/v1/internal/stock/batch
 * Body: { codes: string[] }
 */
router.post('/batch', batchStockValidator, validateRequest, OnlineStockController.batch);

/**
 * POST /api/v1/internal/stock/reserve
 * Body: { orderId, storefront?, lines: [{ productCode, quantity }] }
 */
router.post('/reserve', reserveStockValidator, validateRequest, OnlineStockController.reserve);

/**
 * POST /api/v1/internal/stock/release
 * Body: { orderId, lines? }
 */
router.post('/release', releaseStockValidator, validateRequest, OnlineStockController.release);

/**
 * POST /api/v1/internal/stock/commit
 * Body: { orderId }
 */
router.post('/commit', commitStockValidator, validateRequest, OnlineStockController.commit);

module.exports = router;
