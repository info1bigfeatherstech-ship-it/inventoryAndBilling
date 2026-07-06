const asyncHandler = require('../../utils/asyncHandler.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');
const ProductService = require('../../services/product/product.service');
const { groupVariantImageFiles } = require('../../utils/productMultipart.utils');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

// ========== HELPER FUNCTIONS FOR ZIP EXTRACTION (Copy from ecomm) ==========

const ZIP_OS_JUNK_NAMES = new Set(['__MACOSX', '.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized']);

const isOsJunkEntryName = (name) => {
  if (!name || typeof name !== 'string') return true;
  if (ZIP_OS_JUNK_NAMES.has(name)) return true;
  if (name.startsWith('._')) return true;
  if (name.startsWith('.')) return true;
  return false;
};

const listRealEntries = (dirPath) => {
  if (!dirPath) return [];
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).filter(e => !isOsJunkEntryName(e.name));
  } catch {
    return [];
  }
};

const resolveZipContentRoot = (extractPath, { maxDepth = 5 } = {}) => {
  if (!extractPath) return extractPath;
  let current = extractPath;
  for (let depth = 0; depth < maxDepth; depth++) {
    const entries = listRealEntries(current);
    if (entries.length === 1 && entries[0].isDirectory()) {
      current = path.join(current, entries[0].name);
      continue;
    }
    break;
  }
  return current;
};


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
  getByBarcode: asyncHandler(async (req, res) => {
    const { barcode } = req.params;
    const shopId = req.query.shop_id;
    
    const product = await ProductService.getProductByBarcode(barcode, shopId, req.user);
    
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

  // Bulk Create CSV with Images Support
  bulkCreateCsv: asyncHandler(async (req, res) => {
    const csvFile = req.files?.file?.[0];
    const zipFile = req.files?.imagesZip?.[0];
  
    if (!csvFile?.buffer) {
      throw new AppError('CSV file is required (field name: file)', 400, 'CSV_FILE_REQUIRED');
    }
  
    const isPreview = req.query.preview === 'true';
    
    let imagesRootFolder = null;
    let tempExtractPath = null;
    
    if (!isPreview && zipFile) {
      tempExtractPath = path.join(__dirname, '../../../uploads/bulk_temp_' + Date.now());
      fs.mkdirSync(tempExtractPath, { recursive: true });
      
      const zip = new AdmZip(zipFile.buffer);
      zip.extractAllTo(tempExtractPath, true);
      imagesRootFolder = resolveZipContentRoot(tempExtractPath);
    }

    const user = { ...req.user };
    const warehouseId = req.body?.warehouse_id || req.query?.warehouse_id;
    if (warehouseId) user.forcedWarehouseId = warehouseId;

    const results = await ProductService.bulkCreateFromCsv(
      csvFile.buffer, 
      user, 
      { 
        warehouseId,
        preview: isPreview,
        imagesRootFolder 
      }
    );
  
    if (tempExtractPath && fs.existsSync(tempExtractPath)) {
      fs.rmSync(tempExtractPath, { recursive: true, force: true });
    }
  
    return successResponse(res, req, {
      statusCode: isPreview ? 200 : 201,
      message: isPreview ? 'Preview generated successfully' : 'Bulk product import completed',
      data: results,
    });
  }),

  bulkDownloadTemplate: asyncHandler(async (req, res) => {
    const buffer = await ProductService.getBulkTemplateBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="bulk-product-upload-template-software-final-with-validation.xlsx"'
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buffer);
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
  // ========== HARD DELETE ARCHIVED PRODUCTS (SUPER_ADMIN) ==========
  hardDelete: asyncHandler(async (req, res) => {
    const result = await ProductService.hardDeleteProducts(req.body.product_ids, req.user);

    return successResponse(res, req, {
      statusCode: 200,
      message: `${result.deleted} product(s) permanently deleted`,
      data: result,
    });
  }),

    // ========== RESTORE SINGLE PRODUCT ==========
restore: asyncHandler(async (req, res) => {
  const result = await ProductService.restoreProduct(req.params.productId, req.user);
  return successResponse(res, req, {
    statusCode: 200,
    message: result.alreadyActive ? 'Product already active' : 'Product restored successfully',
    data: { product_id: req.params.productId, is_active: true },
  });
}),

// ========== BULK RESTORE PRODUCTS ==========
bulkRestore: asyncHandler(async (req, res) => {
  const results = await ProductService.bulkRestore(req.body.product_ids, req.user);
  return successResponse(res, req, {
    statusCode: 200,
    message: 'Bulk product restore completed',
    data: results,
  });
}),

  inventoryStats: asyncHandler(async (req, res) => {
    const stats = await ProductService.getInventoryStats(req.query, withUserContext(req));
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Product inventory stats fetched successfully',
      data: stats,
    });
  }),

// ========== GET ONLY INACTIVE PRODUCTS ==========
listInactive: asyncHandler(async (req, res) => {
  const { total, page, limit, products } = await ProductService.listInactiveProducts(req.query, withUserContext(req));
  
  return successResponse(res, req, {
    statusCode: 200,
    message: 'Inactive products fetched successfully',
    data: products,
    meta: paginatedMeta({ page, limit, total }),
  });
}),
};

module.exports = ProductController;
