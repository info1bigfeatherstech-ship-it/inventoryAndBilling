const asyncHandler = require('../../utils/asyncHandler.utils');
const ShopWarehouseCatalogService = require('../../services/stock/shopWarehouseCatalog.service');
const {
  buildWarehouseProductsCatalogPdf,
} = require('../../services/stock/warehouseProductsCatalogPdf.service');
const { successResponse } = require('../../utils/response.utils');
const logger = require('../../utils/logger.utils');
const { AppError } = require('../../errors/AppError');

const ShopWarehouseCatalogController = {
  getCatalog: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseCatalogService.getWarehouseStockCatalog(
      req.params.shopId,
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Warehouse stock catalog fetched successfully',
      data,
    });
  }),

  getProductsCatalog: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseCatalogService.getWarehouseProductsCatalog(
      req.params.shopId,
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Warehouse products catalog fetched successfully',
      data,
    });
  }),

  downloadProductsCatalogPdf: asyncHandler(async (req, res) => {
    const catalog = await ShopWarehouseCatalogService.getWarehouseProductsCatalog(
      req.params.shopId,
      req.query,
      req.user
    );

    let pdfBuffer;
    try {
      pdfBuffer = await buildWarehouseProductsCatalogPdf(catalog);
    } catch (err) {
      logger.error('Warehouse products catalog PDF failed', {
        shop_id: req.params.shopId,
        warehouse_id: req.query.warehouse_id,
        error: err.message,
        stack: err.stack,
      });
      throw new AppError('Failed to generate products catalog PDF', 500, 'PDF_GENERATION_FAILED');
    }

    const safeWh = String(catalog.warehouse_code || catalog.warehouse_id || 'wh')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const filename = `warehouse-products-${safeWh}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(pdfBuffer);
  }),
};

module.exports = ShopWarehouseCatalogController;
