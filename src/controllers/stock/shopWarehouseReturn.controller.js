const asyncHandler = require('../../utils/asyncHandler.utils');
const { AppError } = require('../../errors/AppError');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');
const ShopWarehouseReturnService = require('../../services/stock/shopWarehouseReturn.service');
const {
  generateShopWarehouseReturnBillPdf,
} = require('../../services/stock/shopWarehouseReturnBillPdf.service');

const ShopWarehouseReturnController = {
  preview: asyncHandler(async (req, res) => {
    const code = req.query.bill_number || req.query.source_number;
    if (!code) {
      throw new AppError('bill_number is required', 400, 'BILL_NUMBER_REQUIRED');
    }
    const data = await ShopWarehouseReturnService.previewByBillNumber(
      code,
      req.user,
      req.query.shop_id
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Return source preview loaded',
      data,
    });
  }),

  create: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseReturnService.createReturn(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Stock return request created',
      data,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, returns } = await ShopWarehouseReturnService.listReturns(
      req.query,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock return requests fetched',
      data: returns,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseReturnService.getById(req.params.returnId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock return request fetched',
      data,
    });
  }),

  approve: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseReturnService.approve(
      req.params.returnId,
      req.body,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock return approved',
      data,
    });
  }),

  reject: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseReturnService.reject(
      req.params.returnId,
      req.body,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock return rejected',
      data,
    });
  }),

  dispatch: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseReturnService.dispatch(req.params.returnId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock return dispatched',
      data,
    });
  }),

  receive: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseReturnService.receive(
      req.params.returnId,
      req.body,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock return received — shop stock reduced, warehouse stock increased',
      data,
    });
  }),

  cancel: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseReturnService.cancel(
      req.params.returnId,
      req.body,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Stock return cancelled',
      data,
    });
  }),

  getBill: asyncHandler(async (req, res) => {
    const data = await ShopWarehouseReturnService.getReturnBillDocument(
      req.params.returnId,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Return bill document',
      data,
    });
  }),

  downloadBillPdf: asyncHandler(async (req, res) => {
    const doc = await ShopWarehouseReturnService.getReturnBillDocument(
      req.params.returnId,
      req.user
    );
    let pdfBuffer;
    try {
      pdfBuffer = await generateShopWarehouseReturnBillPdf(doc);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        err?.message || 'Failed to generate return bill PDF',
        500,
        'RETURN_BILL_PDF_FAILED'
      );
    }
    const safeName = String(doc.return_bill_number || 'return-bill').replace(/[^\w.-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  }),
};

module.exports = ShopWarehouseReturnController;
