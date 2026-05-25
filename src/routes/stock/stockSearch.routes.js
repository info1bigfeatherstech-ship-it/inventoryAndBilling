const express = require('express');
const router = express.Router();

const StockSearchController = require('../../controllers/stock/stockSearch.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');
const { requireAuth } = require('../../middlewares/auth.middleware');
const { stockSearchValidator } = require('../../validators/stock/stockSearch.validators');

router.use(requireAuth);

router.get('/', stockSearchValidator, validateRequest, StockSearchController.search);

module.exports = router;
