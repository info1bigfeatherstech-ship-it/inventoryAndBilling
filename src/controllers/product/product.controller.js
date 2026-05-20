const asyncHandler = require('../../utils/asyncHandler.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');
const ProductService = require('../../services/product/product.service');
const { groupVariantImageFiles } = require('../../utils/productMultipart.utils');

const parseKeepImageIds = (raw) => {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through
    }
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
};

const withUserContext = (req) => {
  const user = { ...req.user };
  if (req.user.role === 'SUPER_ADMIN' && req.query.warehouse_id) {
    user.requestedWarehouseFilter = req.query.warehouse_id;
  }
  return user;
};

const ProductController = {
  create: asyncHandler(async (req, res) => {
    const variantImagesByIndex = groupVariantImageFiles(req.files);
    const product = await ProductService.createProduct(req.body, req.user, { variantImagesByIndex });
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Product created successfully',
      data: product,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, products } = await ProductService.listProducts(req.query, withUserContext(req));
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Products fetched successfully',
      data: products,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const product = await ProductService.getProductById(req.params.productId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Product fetched successfully',
      data: product,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const product = await ProductService.updateProductLevel(req.params.productId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Product updated successfully',
      data: product,
    });
  }),

  updateVariant: asyncHandler(async (req, res) => {
    const product = await ProductService.updateVariant(
      req.params.productId,
      req.params.variantId,
      req.body,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Variant updated successfully',
      data: product,
    });
  }),

  createVariant: asyncHandler(async (req, res) => {
    const variantImagesByIndex = groupVariantImageFiles(req.files);
    const product = await ProductService.createVariant(req.params.productId, req.body, req.user, {
      variantImagesByIndex,
    });
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Variant created successfully',
      data: product,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await ProductService.softDeleteProduct(req.params.productId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: result.alreadyInactive ? 'Product already inactive' : 'Product deactivated successfully',
      data: { product_id: req.params.productId, is_active: false },
    });
  }),

  uploadVariantImages: asyncHandler(async (req, res) => {
    const images = await ProductService.addVariantImages(
      req.params.productId,
      req.params.variantId,
      req.files,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Variant images uploaded successfully',
      data: images,
    });
  }),

  syncVariantImages: asyncHandler(async (req, res) => {
    const keepImageIds = parseKeepImageIds(req.body.keep_image_ids);
    const images = await ProductService.syncVariantImages(
      req.params.productId,
      req.params.variantId,
      keepImageIds,
      req.files,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Variant images synced successfully',
      data: images,
    });
  }),

  bulkCreateCsv: asyncHandler(async (req, res) => {
    if (!req.file?.buffer) {
      throw new AppError('CSV file is required (field name: file)', 400, 'CSV_FILE_REQUIRED');
    }

    const user = { ...req.user };
    const warehouseId = req.body?.warehouse_id || req.query?.warehouse_id;
    if (warehouseId) user.forcedWarehouseId = warehouseId;

    const results = await ProductService.bulkCreateFromCsv(req.file.buffer, user, { warehouseId });

    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk product import completed',
      data: results,
    });
  }),

  bulkUpdate: asyncHandler(async (req, res) => {
    const results = await ProductService.bulkUpdate(req.body.items, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk product update completed',
      data: results,
    });
  }),

  bulkDelete: asyncHandler(async (req, res) => {
    const results = await ProductService.bulkSoftDelete(req.body.product_ids, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bulk product deactivation completed',
      data: results,
    });
  }),
};

module.exports = ProductController;
