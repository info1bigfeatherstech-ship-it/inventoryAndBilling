const { AppError } = require('../middlewares/error.middleware');
const MediaService = require('../services/storage/media.service');

const VARIANT_IMAGE_FIELD_RE = /^variant_images_(\d+)$/i;

/**
 * Group multer files by variant index from field names: variant_images_0, variant_images_1, …
 * Alias: field name "images" maps to variant index 0 (single-variant create).
 */
const groupVariantImageFiles = (files = []) => {
  const map = new Map();

  const push = (index, file) => {
    if (!map.has(index)) map.set(index, []);
    map.get(index).push(file);
  };

  for (const file of files) {
    const match = String(file.fieldname || '').match(VARIANT_IMAGE_FIELD_RE);
    if (match) {
      push(Number(match[1]), file);
      continue;
    }
    if (file.fieldname === 'images') {
      push(0, file);
    }
  }

  return map;
};

/**
 * Parse product/variant create body from JSON or multipart (`data` = JSON string).
 */
const parseProductJsonBody = (req) => {
  const raw = req.body?.data;
  if (raw === undefined || raw === null || raw === '') {
    return req.body;
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('data must be a JSON object');
    }
    return parsed;
  } catch (error) {
    throw new AppError(
      error.message?.includes('JSON') ? 'Invalid JSON in form field "data"' : error.message,
      400,
      'INVALID_PRODUCT_DATA_JSON'
    );
  }
};

const countVariantsInPayload = (data) => {
  const list = Array.isArray(data?.variants) ? data.variants : [];
  return list.length > 0 ? list.length : 1;
};

const assertVariantImageUploads = (data, variantImagesByIndex) => {
  if (!variantImagesByIndex || variantImagesByIndex.size === 0) return;

  const variantCount = countVariantsInPayload(data);
  const max = MediaService.MAX_IMAGES_PER_VARIANT;

  for (const [index, files] of variantImagesByIndex.entries()) {
    if (index < 0 || index >= variantCount) {
      throw new AppError(
        `variant_images_${index} does not match any variant (0..${variantCount - 1}). Use variant_images_0 … variant_images_${variantCount - 1}.`,
        400,
        'INVALID_VARIANT_IMAGE_INDEX'
      );
    }
    if (!Array.isArray(files) || !files.length) continue;
    if (files.length > max) {
      throw new AppError(
        `variant_images_${index}: at most ${max} images per variant`,
        400,
        'MAX_VARIANT_IMAGES_EXCEEDED',
        { variant_index: index, max, received: files.length }
      );
    }
  }
};

const middlewareParseProductJsonBody = (req, _res, next) => {
  try {
    if (req.body?.data !== undefined && req.body?.data !== null && req.body?.data !== '') {
      req.body = parseProductJsonBody(req);
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  groupVariantImageFiles,
  parseProductJsonBody,
  countVariantsInPayload,
  assertVariantImageUploads,
  middlewareParseProductJsonBody,
};
