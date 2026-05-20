const { parse } = require('csv-parse/sync');
const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const {
  resolveWarehouseId,
  applyWarehouseScope,
  assertProductWarehouseAccess,
} = require('../../utils/productAccess.utils');
const {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelByPattern,
  productDetailCacheKey,
  productListCachePattern,
} = require('../../utils/cache.utils');
const MediaService = require('../storage/media.service');
const { generateSystemBarcode } = require('../../utils/barcode.utils');
const { assertVariantImageUploads } = require('../../utils/productMultipart.utils');

const VARIANT_INCLUDE = {
  orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
  select: {
    variant_id: true,
    product_id: true,
    sku: true,
    variant_code: true,
    system_barcode: true,
    vendor_barcode: true,
    attributes: true,
    mrp: true,
    wholesale_price: true,
    retail_price: true,
    online_price: true,
    purchase_cost: true,
    weight: true,
    length: true,
    width: true,
    height: true,
    low_stock_threshold: true,
    sort_order: true,
    is_default: true,
    is_active: true,
    remarks: true,
    created_at: true,
    updated_at: true,
    images: {
      orderBy: { sort_order: 'asc' },
      select: {
        image_id: true,
        url: true,
        storage_key: true,
        storage_provider: true,
        alt_text: true,
        sort_order: true,
      },
    },
    stocks: {
      select: {
        stock_id: true,
        warehouse_id: true,
        quantity: true,
        room_zone: true,
        rack_shelf: true,
        position: true,
        batch_number: true,
        expiry_date: true,
        low_stock_threshold: true,
      },
    },
  },
};

const PRODUCT_PRICE_SELECT = {
  mrp: true,
  wholesale_price: true,
  retail_price: true,
  online_price: true,
  purchase_cost: true,
};

const PRODUCT_LIST_SELECT = {
  product_id: true,
  warehouse_id: true,
  product_code: true,
  name: true,
  title: true,
  brand_name: true,
  category_id: true,
  sub_category_id: true,
  is_active: true,
  created_at: true,
  updated_at: true,
  ...PRODUCT_PRICE_SELECT,
  category: { select: { category_id: true, name: true } },
  sub_category: { select: { category_id: true, name: true } },
  variants: {
    where: { is_active: true },
    orderBy: { sort_order: 'asc' },
    select: {
      variant_id: true,
      variant_code: true,
      sku: true,
      system_barcode: true,
      attributes: true,
      ...PRODUCT_PRICE_SELECT,
      weight: true,
      length: true,
      width: true,
      height: true,
      is_default: true,
      sort_order: true,
      images: { orderBy: { sort_order: 'asc' }, take: 1, select: { url: true } },
    },
  },
};

const PRODUCT_DETAIL_SELECT = {
  product_id: true,
  warehouse_id: true,
  product_code: true,
  name: true,
  description: true,
  title: true,
  brand_name: true,
  primary_vendor_id: true,
  hsn_code: true,
  gst_percent: true,
  gst_type: true,
  unit_of_measure: true,
  category_id: true,
  sub_category_id: true,
  ...PRODUCT_PRICE_SELECT,
  is_active: true,
  remarks: true,
  created_at: true,
  updated_at: true,
  primary_vendor: { select: { vendor_id: true, company_name: true } },
  category: { select: { category_id: true, name: true } },
  sub_category: { select: { category_id: true, name: true } },
  warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true } },
  variants: VARIANT_INCLUDE,
};

const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const normalizeSku = (value) => String(value || '').trim().toUpperCase();

/** Base product code only (7834). Strips accidental serial suffix (7834-1 → 7834). */
const normalizeBaseProductCode = (value) => {
  const code = normalizeCode(value);
  const match = code.match(/^(.+)-(\d+)$/);
  if (match) return match[1];
  return code;
};

const buildVariantCode = (baseProductCode, serial) => `${baseProductCode}-${serial}`;

const parseVariantSerial = (variantCode, baseProductCode) => {
  const prefix = `${baseProductCode}-`;
  if (!variantCode || !variantCode.startsWith(prefix)) return null;
  const n = parseInt(variantCode.slice(prefix.length), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const sanitizeProductPrices = (data) => {
  const prices = {
    mrp: Number(data.mrp),
    wholesale_price: Number(data.wholesale_price),
    retail_price: Number(data.retail_price),
    online_price:
      data.online_price === null || data.online_price === undefined || data.online_price === ''
        ? null
        : Number(data.online_price),
    purchase_cost:
      data.purchase_cost === null || data.purchase_cost === undefined || data.purchase_cost === ''
        ? null
        : Number(data.purchase_cost),
  };

  validateVariantPricing(prices, 'Product');
  return prices;
};

const VARIANT_PRICE_KEYS = ['mrp', 'wholesale_price', 'retail_price'];

const priceFieldPresent = (obj, key) =>
  obj[key] !== null && obj[key] !== undefined && obj[key] !== '';

const extractVariantPrices = (variant, indexLabel, { required = false } = {}) => {
  const prices = {
    mrp: priceFieldPresent(variant, 'mrp') ? Number(variant.mrp) : null,
    wholesale_price: priceFieldPresent(variant, 'wholesale_price') ? Number(variant.wholesale_price) : null,
    retail_price: priceFieldPresent(variant, 'retail_price') ? Number(variant.retail_price) : null,
    online_price: priceFieldPresent(variant, 'online_price') ? Number(variant.online_price) : null,
    purchase_cost: priceFieldPresent(variant, 'purchase_cost') ? Number(variant.purchase_cost) : null,
  };

  if (required) {
    for (const key of VARIANT_PRICE_KEYS) {
      if (prices[key] == null) {
        throw new AppError(
          `${indexLabel}: ${key} is required — each variant must have its own MRP, wholesale, retail (and optional online) price.`,
          400,
          'VARIANT_PRICES_REQUIRED'
        );
      }
    }
  }

  validateVariantPricing(
    {
      mrp: prices.mrp ?? 0,
      wholesale_price: prices.wholesale_price ?? 0,
      retail_price: prices.retail_price ?? 0,
      online_price: prices.online_price,
    },
    indexLabel
  );

  return prices;
};

const SHIPPING_KEYS = ['weight', 'length', 'width', 'height'];

const shippingFieldPresent = (obj, key) =>
  obj[key] !== null && obj[key] !== undefined && obj[key] !== '';

const parseShippingInput = (input = {}) => {
  const nested = input.shipping;
  const dims = input.dimensions || nested?.dimensions || {};

  const pick = (...sources) => {
    for (const src of sources) {
      if (src == null) continue;
      if (shippingFieldPresent(src, 'weight')) return Number(src.weight);
      if (shippingFieldPresent(src, 'weight_per_unit')) return Number(src.weight_per_unit);
    }
    return null;
  };

  const pickDim = (key) => {
    if (shippingFieldPresent(input, key)) return Number(input[key]);
    if (shippingFieldPresent(dims, key)) return Number(dims[key]);
    if (nested?.dimensions && shippingFieldPresent(nested.dimensions, key)) return Number(nested.dimensions[key]);
    return null;
  };

  return {
    weight: pick(input, nested),
    length: pickDim('length'),
    width: pickDim('width'),
    height: pickDim('height'),
  };
};

const validateVariantShipping = (shipping, indexLabel = '') => {
  const prefix = indexLabel ? `${indexLabel}: ` : '';
  for (const key of SHIPPING_KEYS) {
    if (shipping[key] != null && shipping[key] < 0) {
      throw new AppError(`${prefix}${key} cannot be negative`, 400, 'INVALID_VARIANT_SHIPPING');
    }
  }
};

const extractVariantShipping = (variant, indexLabel, { required = false } = {}) => {
  const shipping = parseShippingInput(variant);

  if (required) {
    for (const key of SHIPPING_KEYS) {
      if (shipping[key] == null) {
        throw new AppError(
          `${indexLabel}: ${key} is required — each variant has its own weight and dimensions for shipping.`,
          400,
          'VARIANT_SHIPPING_REQUIRED'
        );
      }
    }
  }

  validateVariantShipping(shipping, indexLabel);
  return shipping;
};

const resolveCreateShippingContext = (data) => {
  const rawVariants = Array.isArray(data.variants) ? data.variants : [];

  if (rawVariants.length >= 1) {
    return {
      eachVariantOwnShipping: true,
      variantOnlyShipping: rawVariants.map((v, i) =>
        extractVariantShipping(v, `Variant ${i + 1}`, { required: true })
      ),
      productShipping: null,
    };
  }

  return {
    eachVariantOwnShipping: false,
    variantOnlyShipping: null,
    productShipping: extractVariantShipping(data, 'Product', { required: false }),
  };
};

const mergeVariantShipping = (productShipping, variantInput = {}) => {
  const parsed = parseShippingInput(variantInput);
  const base = productShipping || { weight: null, length: null, width: null, height: null };

  return {
    weight: parsed.weight ?? base.weight,
    length: parsed.length ?? base.length,
    width: parsed.width ?? base.width,
    height: parsed.height ?? base.height,
  };
};

/** Product-level defaults for DB; each variant still stores its own four prices. */
const resolveCreatePricingContext = (data) => {
  const rawVariants = Array.isArray(data.variants) ? data.variants : [];

  if (rawVariants.length >= 1) {
    const variantOnlyPrices = rawVariants.map((v, i) =>
      extractVariantPrices(v, `Variant ${i + 1}`, { required: true })
    );

    const productPrices = sanitizeProductPrices({
      mrp: variantOnlyPrices[0].mrp,
      wholesale_price: variantOnlyPrices[0].wholesale_price,
      retail_price: variantOnlyPrices[0].retail_price,
      online_price: variantOnlyPrices[0].online_price,
      purchase_cost: variantOnlyPrices[0].purchase_cost ?? data.purchase_cost,
    });

    return { productPrices, eachVariantOwnPrices: true, variantOnlyPrices };
  }

  const productPrices = sanitizeProductPrices(data);
  return { productPrices, eachVariantOwnPrices: false, variantOnlyPrices: null };
};

const mergeVariantPrices = (productPrices, variantInput = {}) => {
  const has = (key) => priceFieldPresent(variantInput, key);

  return {
    mrp: has('mrp') ? Number(variantInput.mrp) : productPrices.mrp,
    wholesale_price: has('wholesale_price') ? Number(variantInput.wholesale_price) : productPrices.wholesale_price,
    retail_price: has('retail_price') ? Number(variantInput.retail_price) : productPrices.retail_price,
    online_price: has('online_price') ? Number(variantInput.online_price) : productPrices.online_price,
    purchase_cost: has('purchase_cost') ? Number(variantInput.purchase_cost) : productPrices.purchase_cost,
  };
};

const getNextVariantSerial = async (tx, productId, baseProductCode) => {
  const variants = await tx.productVariant.findMany({
    where: { product_id: productId },
    select: { variant_code: true },
  });

  let maxSerial = 0;
  for (const row of variants) {
    const serial = parseVariantSerial(row.variant_code, baseProductCode);
    if (serial && serial > maxSerial) maxSerial = serial;
  }

  return maxSerial + 1;
};

const formatVariantShipping = (variant) => {
  if (!variant) return variant;
  return {
    ...variant,
    shipping: {
      weight: variant.weight ?? 0,
      dimensions: {
        length: variant.length ?? 0,
        width: variant.width ?? 0,
        height: variant.height ?? 0,
      },
    },
  };
};

const attachListingMeta = (product) => {
  if (!product) return product;
  const variants = (product.variants || []).map(formatVariantShipping);
  return {
    ...product,
    variants,
    variant_count: variants.length,
    is_single_variant: variants.length <= 1,
    /** variant[0] is the primary sellable unit when only one exists */
    primary_variant: variants[0] || null,
  };
};

const parseAttributes = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // key:value pairs separated by |
      const pairs = raw.split('|').map((p) => p.trim()).filter(Boolean);
      return pairs.map((pair) => {
        const [key, ...rest] = pair.split(':');
        return { key: key.trim(), value: rest.join(':').trim() };
      });
    }
  }
  return null;
};

const validateVariantPricing = (variant, indexLabel = '') => {
  const prefix = indexLabel ? `${indexLabel}: ` : '';
  if (variant.mrp < 0 || variant.wholesale_price < 0 || variant.retail_price < 0) {
    throw new AppError(`${prefix}Prices cannot be negative`, 400, 'INVALID_VARIANT_PRICE');
  }
  if (variant.online_price != null && variant.online_price < 0) {
    throw new AppError(`${prefix}Online price cannot be negative`, 400, 'INVALID_VARIANT_PRICE');
  }
  if (variant.online_price != null && variant.online_price > variant.mrp) {
    throw new AppError(`${prefix}Online price cannot exceed MRP`, 400, 'INVALID_VARIANT_PRICE');
  }
};

const assertCategoryValid = async (categoryId, subCategoryId) => {
  const category = await prisma.category.findUnique({
    where: { category_id: categoryId },
    select: { category_id: true, is_active: true, parent_id: true },
  });
  if (!category) throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
  if (!category.is_active) throw new AppError('Category is inactive', 400, 'CATEGORY_INACTIVE');

  if (!subCategoryId) return;

  const sub = await prisma.category.findUnique({
    where: { category_id: subCategoryId },
    select: { category_id: true, parent_id: true, is_active: true },
  });
  if (!sub) throw new AppError('Sub-category not found', 404, 'SUB_CATEGORY_NOT_FOUND');
  if (!sub.is_active) throw new AppError('Sub-category is inactive', 400, 'SUB_CATEGORY_INACTIVE');
  if (sub.parent_id !== categoryId) {
    throw new AppError('Sub-category must belong to the selected category', 400, 'INVALID_SUB_CATEGORY');
  }
};

const assertVendorActive = async (vendorId) => {
  const vendor = await prisma.vendor.findUnique({
    where: { vendor_id: vendorId },
    select: { vendor_id: true, is_active: true },
  });
  if (!vendor) throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
  if (!vendor.is_active) throw new AppError('Vendor is inactive', 409, 'VENDOR_INACTIVE');
};

const assertWarehouseActive = async (warehouseId) => {
  const warehouse = await prisma.warehouse.findUnique({
    where: { warehouse_id: warehouseId },
    select: { warehouse_id: true, is_active: true },
  });
  if (!warehouse) throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  if (!warehouse.is_active) throw new AppError('Warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');
};

const assertNoStockOnListing = (data) => {
  if (data.initial_stock) {
    throw new AppError(
      'Stock is recorded after product listing and labelling. Use POST /api/v1/product-stocks when goods are shelved.',
      400,
      'STOCK_NOT_ALLOWED_ON_LISTING'
    );
  }

  if (Array.isArray(data.variants) && data.variants.some((v) => v && v.stock)) {
    throw new AppError(
      'Variant stock cannot be set during product listing. Use POST /api/v1/product-stocks later.',
      400,
      'STOCK_NOT_ALLOWED_ON_LISTING'
    );
  }
};

/** Every variant must belong to the same product base (8878-1, 8878-2 — never 9978-1 on same product). */
const assertVariantUsesProductBase = (variant, baseProductCode, indexLabel) => {
  if (variant.product_code) {
    const incomingBase = normalizeBaseProductCode(variant.product_code);
    if (incomingBase !== baseProductCode) {
      throw new AppError(
        `${indexLabel}: all variants must share product base "${baseProductCode}". Got "${incomingBase}".`,
        400,
        'VARIANT_BASE_CODE_MISMATCH'
      );
    }
  }

  if (variant.variant_code) {
    const code = normalizeCode(variant.variant_code);
    const serial = parseVariantSerial(code, baseProductCode);
    if (!serial) {
      const incomingBase = normalizeBaseProductCode(code);
      throw new AppError(
        `${indexLabel}: variant_code must be "${baseProductCode}-<n>". Cannot use base "${incomingBase}".`,
        400,
        'VARIANT_BASE_CODE_MISMATCH'
      );
    }
  }

  if (variant.sku) {
    const sku = normalizeSku(variant.sku);
    const serial = parseVariantSerial(sku, baseProductCode);
    if (sku.includes('-') && !serial) {
      throw new AppError(
        `${indexLabel}: sku must follow "${baseProductCode}-<n>" when using serial pattern.`,
        400,
        'VARIANT_BASE_CODE_MISMATCH'
      );
    }
  }
};

const buildVariantInput = async (tx, variant, {
  baseProductCode,
  serial,
  productPrices,
  variantOnlyPrice,
  productShipping,
  variantOnlyShipping,
  indexLabel,
}) => {
  assertVariantUsesProductBase(variant, baseProductCode, indexLabel);

  const variantCode = buildVariantCode(baseProductCode, serial);
  const prices = variantOnlyPrice ?? mergeVariantPrices(productPrices, variant);
  const shipping = variantOnlyShipping ?? mergeVariantShipping(productShipping, variant);

  let systemBarcode = variant.system_barcode ? normalizeCode(variant.system_barcode) : null;
  if (!systemBarcode) {
    systemBarcode = await generateSystemBarcode(tx);
  }

  const payload = {
    sku: normalizeSku(variant.sku || variantCode),
    variant_code: variantCode,
    system_barcode: systemBarcode,
    vendor_barcode: variant.vendor_barcode ? normalizeCode(variant.vendor_barcode) : null,
    attributes: parseAttributes(variant.attributes),
    ...prices,
    ...shipping,
    low_stock_threshold: variant.low_stock_threshold != null ? Number(variant.low_stock_threshold) : 10,
    sort_order: serial - 1,
    is_default: serial === 1,
    is_active: variant.is_active !== false,
    remarks: variant.remarks ?? null,
  };

  validateVariantPricing(payload, indexLabel);
  return payload;
};

const normalizeVariantsForCreate = async (tx, data, baseProductCode, pricingContext, shippingContext) => {
  const { productPrices, eachVariantOwnPrices, variantOnlyPrices } = pricingContext;
  const { eachVariantOwnShipping, variantOnlyShipping, productShipping } = shippingContext;
  const rawList = Array.isArray(data.variants) ? data.variants : [];

  const list =
    rawList.length > 0
      ? rawList
      : [
          {
            system_barcode: data.system_barcode,
            vendor_barcode: data.vendor_barcode,
            attributes: data.attributes,
            weight: data.weight,
            length: data.length,
            width: data.width,
            height: data.height,
            weight_per_unit: data.weight_per_unit,
            shipping: data.shipping,
            dimensions: data.dimensions,
            low_stock_threshold: data.low_stock_threshold,
            remarks: data.remarks,
          },
        ];

  const sanitized = [];
  for (let index = 0; index < list.length; index += 1) {
    sanitized.push(
      await buildVariantInput(tx, list[index], {
        baseProductCode,
        serial: index + 1,
        productPrices,
        variantOnlyPrice: eachVariantOwnPrices ? variantOnlyPrices[index] : null,
        productShipping,
        variantOnlyShipping: eachVariantOwnShipping ? variantOnlyShipping[index] : null,
        indexLabel: `Variant ${index + 1}`,
      })
    );
  }

  const barcodeSet = new Set();
  for (const v of sanitized) {
    if (barcodeSet.has(v.system_barcode)) {
      throw new AppError(`Duplicate system_barcode in request: ${v.system_barcode}`, 400, 'DUPLICATE_BARCODE');
    }
    barcodeSet.add(v.system_barcode);
  }

  return sanitized;
};

const invalidateProductCaches = async (productId, warehouseId) => {
  await Promise.all([
    cacheDel(productDetailCacheKey(productId)),
    cacheDelByPattern(productListCachePattern(warehouseId)),
  ]);
};

const fetchProductDetail = async (productId) =>
  prisma.product.findUnique({
    where: { product_id: productId },
    select: PRODUCT_DETAIL_SELECT,
  });

const buildProductWhere = (query = {}, user) => {
  const where = {};

  if (typeof query.is_active === 'boolean') {
    where.is_active = query.is_active;
  } else if (query.include_inactive !== true) {
    where.is_active = true;
  }

  if (query.category_id) where.category_id = query.category_id;
  if (query.sub_category_id) where.sub_category_id = query.sub_category_id;
  if (query.primary_vendor_id) where.primary_vendor_id = query.primary_vendor_id;

  if (query.search) {
    const search = String(query.search).trim();
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { product_code: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      {
        variants: {
          some: {
            OR: [
              { sku: { contains: search, mode: 'insensitive' } },
              { variant_code: { contains: search, mode: 'insensitive' } },
              { system_barcode: { contains: search, mode: 'insensitive' } },
              { vendor_barcode: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  applyWarehouseScope(where, user);
  return where;
};

const persistVariantImages = async ({ productId, variantId, warehouseId, files, startSortOrder = 0 }) => {
  const incoming = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!incoming.length) return [];

  const existingCount = await prisma.productVariantImage.count({ where: { variant_id: variantId } });
  if (existingCount + incoming.length > MediaService.MAX_IMAGES_PER_VARIANT) {
    throw new AppError(
      `A variant can have at most ${MediaService.MAX_IMAGES_PER_VARIANT} images`,
      400,
      'MAX_VARIANT_IMAGES_EXCEEDED',
      { max: MediaService.MAX_IMAGES_PER_VARIANT, existing: existingCount, requested: incoming.length }
    );
  }

  const uploads = [];
  for (const file of incoming) {
    uploads.push(
      await MediaService.uploadVariantImage({
        warehouseId,
        productId,
        variantId,
        file,
      })
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const rows = [];
      for (let i = 0; i < uploads.length; i += 1) {
        const row = await tx.productVariantImage.create({
          data: {
            variant_id: variantId,
            url: uploads[i].url,
            storage_key: uploads[i].storage_key,
            storage_provider: uploads[i].storage_provider,
            sort_order: startSortOrder + i,
          },
          select: {
            image_id: true,
            url: true,
            storage_key: true,
            storage_provider: true,
            alt_text: true,
            sort_order: true,
          },
        });
        rows.push(row);
      }
      return rows;
    });
  } catch (error) {
    await Promise.all(
      uploads.map((u) => MediaService.deleteStoredImage(u.storage_provider, u.storage_key))
    );
    throw error;
  }
};

const applyVariantImagesOnCreate = async (productId, warehouseId, data, variantImagesByIndex) => {
  const variants = await prisma.productVariant.findMany({
    where: { product_id: productId },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    select: { variant_id: true },
  });

  const stagedForRollback = [];

  try {
    for (let index = 0; index < variants.length; index += 1) {
      const files = variantImagesByIndex.get(index);
      if (!files?.length) continue;

      const rows = await persistVariantImages({
        productId,
        variantId: variants[index].variant_id,
        warehouseId,
        files,
        startSortOrder: 0,
      });
      stagedForRollback.push(...rows);
    }
  } catch (error) {
    await Promise.all(
      stagedForRollback.map((row) =>
        MediaService.deleteStoredImage(row.storage_provider, row.storage_key)
      )
    );
    if (stagedForRollback.length) {
      await prisma.productVariantImage.deleteMany({
        where: { image_id: { in: stagedForRollback.map((r) => r.image_id) } },
      });
    }
    throw error;
  }
};

const ProductService = {
  async createProduct(data, user, { variantImagesByIndex } = {}) {
    const warehouseId = resolveWarehouseId(user, data.warehouse_id);
    await assertWarehouseActive(warehouseId);
    await assertVendorActive(data.primary_vendor_id);
    await assertCategoryValid(data.category_id, data.sub_category_id);

    const baseProductCode = normalizeBaseProductCode(data.product_code);
    if (!baseProductCode) throw new AppError('product_code is required', 400, 'PRODUCT_CODE_REQUIRED');
    if (!data.name?.trim()) throw new AppError('name is required', 400, 'PRODUCT_NAME_REQUIRED');

    assertNoStockOnListing(data);

    const imageMap = variantImagesByIndex instanceof Map ? variantImagesByIndex : new Map();
    assertVariantImageUploads(data, imageMap);

    const existingBase = await prisma.product.findFirst({
      where: { warehouse_id: warehouseId, product_code: baseProductCode },
      select: { product_id: true },
    });
    if (existingBase) {
      throw new AppError(
        `Product base code "${baseProductCode}" already exists in this warehouse. Add a variant via POST /products/:id/variants instead.`,
        409,
        'PRODUCT_CODE_ALREADY_EXISTS'
      );
    }

    const pricingContext = resolveCreatePricingContext(data);
    const shippingContext = resolveCreateShippingContext(data);
    const { productPrices } = pricingContext;

    const productPayload = {
      warehouse_id: warehouseId,
      product_code: baseProductCode,
      name: String(data.name).trim(),
      description: data.description ?? null,
      title: data.title ?? null,
      brand_name: data.brand_name ?? null,
      primary_vendor_id: data.primary_vendor_id,
      hsn_code: normalizeCode(data.hsn_code),
      gst_percent: Number(data.gst_percent),
      gst_type: data.gst_type,
      unit_of_measure: String(data.unit_of_measure).trim(),
      category_id: data.category_id,
      sub_category_id: data.sub_category_id ?? null,
      remarks: data.remarks ?? null,
      ...productPrices,
    };

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: productPayload,
        select: { product_id: true, warehouse_id: true },
      });

      const variants = await normalizeVariantsForCreate(tx, data, baseProductCode, pricingContext, shippingContext);

      for (const v of variants) {
        await tx.productVariant.create({
          data: {
            product_id: created.product_id,
            ...v,
          },
        });
      }

      return { product_id: created.product_id, warehouse_id: created.warehouse_id };
    });

    if (imageMap.size > 0) {
      await applyVariantImagesOnCreate(product.product_id, product.warehouse_id, data, imageMap);
    }

    await invalidateProductCaches(product.product_id, product.warehouse_id);
    return attachListingMeta(await fetchProductDetail(product.product_id));
  },

  async listProducts(query = {}, user) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = buildProductWhere(query, user);

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: [{ is_active: 'desc' }, { updated_at: 'desc' }],
        select: PRODUCT_LIST_SELECT,
      }),
    ]);

    return { total, page, limit, products: products.map(attachListingMeta) };
  },

  async getProductById(productId, user, { bypassCache = false } = {}) {
    const cacheKey = productDetailCacheKey(productId);

    if (!bypassCache) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        assertProductWarehouseAccess(cached.warehouse_id, user);
        return attachListingMeta(cached);
      }
    }

    const product = await fetchProductDetail(productId);
    if (!product) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');

    assertProductWarehouseAccess(product.warehouse_id, user);
    const enriched = attachListingMeta(product);
    await cacheSet(cacheKey, enriched);
    return enriched;
  },

  async updateProduct(productId, data, user) {
    return this.updateProductLevel(productId, data, user);
  },

  async updateProductLevel(productId, data, user) {
    const existing = await prisma.product.findUnique({
      where: { product_id: productId },
      select: { product_id: true, warehouse_id: true, product_code: true, is_active: true },
    });
    if (!existing) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    assertProductWarehouseAccess(existing.warehouse_id, user);

    const productFields = {};
    const allowedProductFields = [
      'name',
      'description',
      'title',
      'brand_name',
      'primary_vendor_id',
      'hsn_code',
      'gst_percent',
      'gst_type',
      'unit_of_measure',
      'category_id',
      'sub_category_id',
      'mrp',
      'wholesale_price',
      'retail_price',
      'online_price',
      'purchase_cost',
      'is_active',
      'remarks',
    ];

    for (const key of allowedProductFields) {
      if (Object.prototype.hasOwnProperty.call(data, key)) productFields[key] = data[key];
    }

    if (productFields.hsn_code) productFields.hsn_code = normalizeCode(productFields.hsn_code);
    if (productFields.name) productFields.name = String(productFields.name).trim();
    if (productFields.primary_vendor_id) await assertVendorActive(productFields.primary_vendor_id);

    const hasPriceField = ['mrp', 'wholesale_price', 'retail_price', 'online_price', 'purchase_cost'].some((k) =>
      Object.prototype.hasOwnProperty.call(productFields, k)
    );
    if (hasPriceField) {
      const current = await prisma.product.findUnique({
        where: { product_id: productId },
        select: { mrp: true, wholesale_price: true, retail_price: true, online_price: true, purchase_cost: true },
      });
      validateVariantPricing({ ...current, ...productFields }, 'Product');
    }

    const categoryId = productFields.category_id || undefined;
    const subCategoryId = productFields.sub_category_id !== undefined ? productFields.sub_category_id : undefined;
    if (categoryId || subCategoryId) {
      const current = await prisma.product.findUnique({
        where: { product_id: productId },
        select: { category_id: true, sub_category_id: true },
      });
      await assertCategoryValid(
        categoryId || current.category_id,
        subCategoryId !== undefined ? subCategoryId : current.sub_category_id
      );
    }

    if (!Object.keys(productFields).length) {
      throw new AppError('No updatable product fields provided', 400, 'EMPTY_UPDATE');
    }

    await prisma.product.update({ where: { product_id: productId }, data: productFields });

    if (data.apply_prices_to_variants === true && hasPriceField) {
      const pricePayload = {};
      for (const key of ['mrp', 'wholesale_price', 'retail_price', 'online_price', 'purchase_cost']) {
        if (Object.prototype.hasOwnProperty.call(productFields, key)) pricePayload[key] = productFields[key];
      }
      if (Object.keys(pricePayload).length) {
        await prisma.productVariant.updateMany({ where: { product_id: productId }, data: pricePayload });
      }
    }

    await invalidateProductCaches(productId, existing.warehouse_id);
    return attachListingMeta(await fetchProductDetail(productId));
  },

  async updateVariant(productId, variantId, data, user) {
    const existing = await prisma.product.findUnique({
      where: { product_id: productId },
      select: {
        product_id: true,
        warehouse_id: true,
        product_code: true,
        mrp: true,
        wholesale_price: true,
        retail_price: true,
        online_price: true,
        purchase_cost: true,
      },
    });
    if (!existing) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    assertProductWarehouseAccess(existing.warehouse_id, user);

    const current = await prisma.productVariant.findFirst({
      where: { variant_id: variantId, product_id: productId },
    });
    if (!current) throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');

    if (Object.prototype.hasOwnProperty.call(data, 'variant_code')) {
      throw new AppError('variant_code cannot be changed after creation', 400, 'VARIANT_CODE_IMMUTABLE');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'product_code')) {
      throw new AppError('product_code is set at product level only', 400, 'PRODUCT_CODE_IMMUTABLE');
    }

    const variantPayload = {};
    const allowedVariantFields = [
      'sku',
      'system_barcode',
      'vendor_barcode',
      'attributes',
      'mrp',
      'wholesale_price',
      'retail_price',
      'online_price',
      'purchase_cost',
      'weight',
      'length',
      'width',
      'height',
      'low_stock_threshold',
      'sort_order',
      'is_default',
      'is_active',
      'remarks',
    ];

    for (const key of allowedVariantFields) {
      if (Object.prototype.hasOwnProperty.call(data, key)) variantPayload[key] = data[key];
    }

    if (variantPayload.sku) {
      variantPayload.sku = normalizeSku(variantPayload.sku);
      assertVariantUsesProductBase({ sku: variantPayload.sku }, existing.product_code, 'Variant');
    }
    if (variantPayload.system_barcode) {
      variantPayload.system_barcode = normalizeCode(variantPayload.system_barcode);
    }
    if (variantPayload.vendor_barcode) variantPayload.vendor_barcode = normalizeCode(variantPayload.vendor_barcode);
    if (variantPayload.attributes !== undefined) variantPayload.attributes = parseAttributes(variantPayload.attributes);

    const hasShippingField = ['weight', 'length', 'width', 'height'].some((k) =>
      Object.prototype.hasOwnProperty.call(variantPayload, k)
    );
    if (hasShippingField) {
      const merged = mergeVariantShipping(current, variantPayload);
      for (const key of ['weight', 'length', 'width', 'height']) {
        if (Object.prototype.hasOwnProperty.call(variantPayload, key)) {
          variantPayload[key] = merged[key];
        }
      }
      validateVariantShipping(variantPayload);
    }

    if (!Object.keys(variantPayload).length) {
      throw new AppError('No updatable variant fields provided', 400, 'EMPTY_UPDATE');
    }

    validateVariantPricing({ ...current, ...variantPayload });

    if (variantPayload.is_default === true) {
      await prisma.productVariant.updateMany({
        where: { product_id: productId, variant_id: { not: variantId } },
        data: { is_default: false },
      });
    }

    await prisma.productVariant.update({ where: { variant_id: variantId }, data: variantPayload });
    await invalidateProductCaches(productId, existing.warehouse_id);
    return attachListingMeta(await fetchProductDetail(productId));
  },

  async createVariant(productId, data, user, { variantImagesByIndex } = {}) {
    const existing = await prisma.product.findUnique({
      where: { product_id: productId },
      select: {
        product_id: true,
        warehouse_id: true,
        product_code: true,
        is_active: true,
        mrp: true,
        wholesale_price: true,
        retail_price: true,
        online_price: true,
        purchase_cost: true,
      },
    });
    if (!existing) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    if (!existing.is_active) throw new AppError('Cannot add variant to inactive product', 409, 'PRODUCT_INACTIVE');
    assertProductWarehouseAccess(existing.warehouse_id, user);

    assertNoStockOnListing(data);

    const variantOwnPrices = extractVariantPrices(data, 'New variant', { required: true });
    const variantOwnShipping = extractVariantShipping(data, 'New variant', { required: true });

    const imageMap = variantImagesByIndex instanceof Map ? variantImagesByIndex : new Map();
    assertVariantImageUploads({ variants: [{}] }, imageMap);

    const newVariantId = await prisma.$transaction(async (tx) => {
      const serial = await getNextVariantSerial(tx, productId, existing.product_code);
      const sanitized = await buildVariantInput(tx, data, {
        baseProductCode: existing.product_code,
        serial,
        productPrices: existing,
        variantOnlyPrice: variantOwnPrices,
        variantOnlyShipping: variantOwnShipping,
        indexLabel: `Variant ${serial}`,
      });

      await tx.productVariant.updateMany({
        where: { product_id: productId },
        data: { is_default: false },
      });

      const created = await tx.productVariant.create({
        data: {
          product_id: productId,
          ...sanitized,
          is_default: false,
        },
        select: { variant_id: true },
      });

      return created.variant_id;
    });

    const newVariantFiles = imageMap.get(0) || imageMap.get('0') || [];
    if (newVariantFiles.length) {
      await persistVariantImages({
        productId,
        variantId: newVariantId,
        warehouseId: existing.warehouse_id,
        files: newVariantFiles,
      });
    }

    await invalidateProductCaches(productId, existing.warehouse_id);
    return attachListingMeta(await fetchProductDetail(productId));
  },

  async softDeleteProduct(productId, user) {
    const existing = await prisma.product.findUnique({
      where: { product_id: productId },
      select: { product_id: true, warehouse_id: true, is_active: true },
    });
    if (!existing) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    assertProductWarehouseAccess(existing.warehouse_id, user);

    if (!existing.is_active) return { alreadyInactive: true };

    const images = await prisma.productVariantImage.findMany({
      where: { variant: { product_id: productId } },
      select: { storage_key: true, storage_provider: true },
    });

    await prisma.$transaction([
      prisma.product.update({ where: { product_id: productId }, data: { is_active: false } }),
      prisma.productVariant.updateMany({ where: { product_id: productId }, data: { is_active: false } }),
    ]);

    await Promise.all(
      images.map((img) => MediaService.deleteStoredImage(img.storage_provider, img.storage_key))
    );

    await invalidateProductCaches(productId, existing.warehouse_id);
    return { alreadyInactive: false };
  },

  async addVariantImages(productId, variantId, files, user) {
    const product = await prisma.product.findUnique({
      where: { product_id: productId },
      select: { product_id: true, warehouse_id: true },
    });
    if (!product) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    assertProductWarehouseAccess(product.warehouse_id, user);

    const variant = await prisma.productVariant.findFirst({
      where: { variant_id: variantId, product_id: productId },
      select: { variant_id: true, _count: { select: { images: true } } },
    });
    if (!variant) throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');

    const incoming = Array.isArray(files) ? files : [];
    if (!incoming.length) throw new AppError('At least one image file is required', 400, 'IMAGE_REQUIRED');

    const created = await persistVariantImages({
      productId,
      variantId,
      warehouseId: product.warehouse_id,
      files: incoming,
      startSortOrder: variant._count.images,
    });

    await invalidateProductCaches(productId, product.warehouse_id);
    return created;
  },

  /**
   * Replace/sync variant images:
   * - keep_image_ids: images to retain (in order)
   * - new files: appended after kept images
   * - images not in keep list are removed from DB and cloud storage
   */
  async syncVariantImages(productId, variantId, keepImageIds, newFiles, user) {
    const product = await prisma.product.findUnique({
      where: { product_id: productId },
      select: { product_id: true, warehouse_id: true },
    });
    if (!product) throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    assertProductWarehouseAccess(product.warehouse_id, user);

    const variant = await prisma.productVariant.findFirst({
      where: { variant_id: variantId, product_id: productId },
      select: { variant_id: true },
    });
    if (!variant) throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');

    const existingImages = await prisma.productVariantImage.findMany({
      where: { variant_id: variantId },
      orderBy: { sort_order: 'asc' },
    });

    const keepIds = Array.isArray(keepImageIds) ? keepImageIds.map(String) : [];
    const existingIdSet = new Set(existingImages.map((img) => img.image_id));

    for (const id of keepIds) {
      if (!existingIdSet.has(id)) {
        throw new AppError(`keep_image_ids contains unknown image: ${id}`, 400, 'INVALID_KEEP_IMAGE_ID');
      }
    }

    const incoming = Array.isArray(newFiles) ? newFiles : [];
    const finalCount = keepIds.length + incoming.length;

    if (finalCount > MediaService.MAX_IMAGES_PER_VARIANT) {
      throw new AppError(
        `A variant can have at most ${MediaService.MAX_IMAGES_PER_VARIANT} images`,
        400,
        'MAX_VARIANT_IMAGES_EXCEEDED',
        { max: MediaService.MAX_IMAGES_PER_VARIANT, requested: finalCount }
      );
    }

    const keepSet = new Set(keepIds);
    const imagesToDelete = existingImages.filter((img) => !keepSet.has(img.image_id));

    const uploads = [];
    for (const file of incoming) {
      uploads.push(
        await MediaService.uploadVariantImage({
          warehouseId: product.warehouse_id,
          productId,
          variantId,
          file,
        })
      );
    }

    const synced = await prisma.$transaction(async (tx) => {
      if (imagesToDelete.length) {
        await tx.productVariantImage.deleteMany({
          where: { image_id: { in: imagesToDelete.map((img) => img.image_id) } },
        });
      }

      for (let i = 0; i < keepIds.length; i += 1) {
        await tx.productVariantImage.update({
          where: { image_id: keepIds[i] },
          data: { sort_order: i },
        });
      }

      const created = [];
      for (let i = 0; i < uploads.length; i += 1) {
        const row = await tx.productVariantImage.create({
          data: {
            variant_id: variantId,
            url: uploads[i].url,
            storage_key: uploads[i].storage_key,
            storage_provider: uploads[i].storage_provider,
            sort_order: keepIds.length + i,
          },
          select: {
            image_id: true,
            url: true,
            storage_key: true,
            storage_provider: true,
            alt_text: true,
            sort_order: true,
          },
        });
        created.push(row);
      }

      return tx.productVariantImage.findMany({
        where: { variant_id: variantId },
        orderBy: { sort_order: 'asc' },
        select: {
          image_id: true,
          url: true,
          storage_key: true,
          storage_provider: true,
          alt_text: true,
          sort_order: true,
        },
      });
    });

    await Promise.all(
      imagesToDelete.map((img) => MediaService.deleteStoredImage(img.storage_provider, img.storage_key))
    );

    await invalidateProductCaches(productId, product.warehouse_id);
    return synced;
  },

  async bulkCreateFromCsv(fileBuffer, user, { warehouseId: requestedWarehouseId } = {}) {
    const warehouseId = resolveWarehouseId(user, requestedWarehouseId || user.forcedWarehouseId);
    await assertWarehouseActive(warehouseId);

    const records = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    if (!records.length) {
      throw new AppError('CSV file is empty', 400, 'CSV_EMPTY');
    }

    const results = { created: 0, failed: [] };

    for (let i = 0; i < records.length; i += 1) {
      const row = records[i];
      try {
        await this.createProduct(
          {
            warehouse_id: warehouseId,
            product_code: row.product_code,
            name: row.name,
            description: row.description || null,
            title: row.title || null,
            brand_name: row.brand_name || null,
            primary_vendor_id: row.primary_vendor_id,
            hsn_code: row.hsn_code,
            gst_percent: row.gst_percent,
            gst_type: row.gst_type,
            unit_of_measure: row.unit_of_measure,
            weight: row.weight || row.weight_per_unit || null,
            length: row.length || null,
            width: row.width || null,
            height: row.height || null,
            category_id: row.category_id,
            sub_category_id: row.sub_category_id || null,
            remarks: row.remarks || null,
            mrp: row.mrp,
            wholesale_price: row.wholesale_price,
            retail_price: row.retail_price,
            online_price: row.online_price || null,
            purchase_cost: row.purchase_cost || null,
            system_barcode: row.system_barcode || null,
            vendor_barcode: row.vendor_barcode || null,
            attributes: row.attributes || null,
            variants: row.variant_system_barcode
              ? [
                  {
                    system_barcode: row.variant_system_barcode,
                    mrp: row.variant_mrp,
                    wholesale_price: row.variant_wholesale_price,
                    retail_price: row.variant_retail_price,
                    online_price: row.variant_online_price || null,
                    weight: row.variant_weight || null,
                    length: row.variant_length || null,
                    width: row.variant_width || null,
                    height: row.variant_height || null,
                  },
                ]
              : undefined,
          },
          user
        );
        results.created += 1;
      } catch (error) {
        results.failed.push({
          row: i + 2,
          message: error.message,
          code: error.code || 'ROW_FAILED',
        });
      }
    }

    await cacheDelByPattern(productListCachePattern(warehouseId));
    return results;
  },

  async bulkUpdate(items, user) {
    if (!Array.isArray(items) || !items.length) {
      throw new AppError('items array is required', 400, 'ITEMS_REQUIRED');
    }

    const results = { updated: 0, failed: [] };

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        if (!item.product_id) throw new AppError('product_id is required', 400, 'PRODUCT_ID_REQUIRED');

        if (item.variant_id) {
          await this.updateVariant(item.product_id, item.variant_id, item, user);
        } else {
          await this.updateProductLevel(item.product_id, item, user);
        }
        results.updated += 1;
      } catch (error) {
        results.failed.push({
          index: i,
          product_id: item.product_id,
          message: error.message,
          code: error.code || 'UPDATE_FAILED',
        });
      }
    }

    return results;
  },

  async bulkSoftDelete(productIds, user) {
    if (!Array.isArray(productIds) || !productIds.length) {
      throw new AppError('product_ids array is required', 400, 'PRODUCT_IDS_REQUIRED');
    }

    const results = { deleted: 0, failed: [] };

    for (const productId of productIds) {
      try {
        const result = await this.softDeleteProduct(productId, user);
        if (!result.alreadyInactive) results.deleted += 1;
      } catch (error) {
        results.failed.push({
          product_id: productId,
          message: error.message,
          code: error.code || 'DELETE_FAILED',
        });
      }
    }

    return results;
  },
};

module.exports = ProductService;
