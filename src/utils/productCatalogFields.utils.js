const prisma = require('./prisma.utils');
const { AppError } = require('../middlewares/error.middleware');

const PRICE_FIELD_KEYS = ['mrp', 'special_price', 'wholesale_price', 'purchase_price', 'expenses'];
const VARIANT_REQUIRED_PRICE_KEYS = ['mrp', 'special_price', 'wholesale_price', 'purchase_price', 'expenses'];
const CATALOG_FIELD_KEYS = [...PRICE_FIELD_KEYS, 'warranty'];

const SHOP_SCOPED_ROLES = new Set(['SHOP_OWNER', 'SHOP_MANAGER', 'BILLING_STAFF']);

const priceFieldPresent = (obj, key) =>
  obj[key] !== null && obj[key] !== undefined && obj[key] !== '';

const sanitizeWarranty = (value, { required = false, label = 'warranty' } = {}) => {
  if (value == null || String(value).trim() === '') {
    if (required) {
      throw new AppError(`${label} is required`, 400, 'WARRANTY_REQUIRED');
    }
    return null;
  }
  const trimmed = String(value).trim();
  if (trimmed.length > 120) {
    throw new AppError(`${label} must be at most 120 characters`, 400, 'WARRANTY_TOO_LONG');
  }
  return trimmed;
};

const resolvePurchasePriceInput = (obj) => {
  if (priceFieldPresent(obj, 'purchase_price')) return Number(obj.purchase_price);
  if (priceFieldPresent(obj, 'purchase_cost')) return Number(obj.purchase_cost);
  return null;
};

const resolveWholesalePriceInput = (obj) => {
  if (priceFieldPresent(obj, 'wholesale_price')) return Number(obj.wholesale_price);
  return null;
};

const validateVariantPricing = (variant, indexLabel = '') => {
  const prefix = indexLabel ? `${indexLabel}: ` : '';
  const {
    mrp,
    special_price,
    wholesale_price,
    purchase_price,
    expenses,
  } = variant;

  for (const [key, val] of Object.entries({ mrp, special_price, wholesale_price, purchase_price, expenses })) {
    if (val == null || Number.isNaN(Number(val)) || Number(val) < 0) {
      throw new AppError(`${prefix}${key} must be a non-negative number`, 400, 'INVALID_VARIANT_PRICE');
    }
  }

  if (Number(special_price) > Number(mrp)) {
    throw new AppError(`${prefix}Special price cannot exceed MRP`, 400, 'INVALID_VARIANT_PRICE');
  }
  if (Number(purchase_price) > Number(wholesale_price)) {
    throw new AppError(`${prefix}Purchase price cannot exceed wholesale price`, 400, 'INVALID_VARIANT_PRICE');
  }
  if (Number(wholesale_price) > Number(special_price)) {
    throw new AppError(`${prefix}Wholesale price cannot exceed special price`, 400, 'INVALID_VARIANT_PRICE');
  }
};

const extractCatalogFields = (input, indexLabel, { required = false } = {}) => {
  const prices = {
    mrp: priceFieldPresent(input, 'mrp') ? Number(input.mrp) : null,
    special_price: priceFieldPresent(input, 'special_price') ? Number(input.special_price) : null,
    wholesale_price: resolveWholesalePriceInput(input),
    purchase_price: resolvePurchasePriceInput(input),
    expenses: priceFieldPresent(input, 'expenses') ? Number(input.expenses) : null,
    warranty: sanitizeWarranty(input.warranty, { required: false }),
  };

  if (required) {
    for (const key of VARIANT_REQUIRED_PRICE_KEYS) {
      if (prices[key] == null) {
        throw new AppError(
          `${indexLabel}: ${key} is required — each variant must have its own pricing.`,
          400,
          'VARIANT_PRICES_REQUIRED'
        );
      }
    }
  }

  validateVariantPricing(
    {
      mrp: prices.mrp ?? 0,
      special_price: prices.special_price ?? 0,
      wholesale_price: prices.wholesale_price ?? 0,
      purchase_price: prices.purchase_price ?? 0,
      expenses: prices.expenses ?? 0,
    },
    indexLabel
  );

  return prices;
};

const sanitizeProductCatalogFields = (data, { required = false, label = 'Product' } = {}) =>
  extractCatalogFields(data, label, { required });

const mergeVariantCatalogFields = (productFields, variantInput = {}) => {
  const has = (key) => priceFieldPresent(variantInput, key);

  return {
    mrp: has('mrp') ? Number(variantInput.mrp) : productFields.mrp,
    special_price: has('special_price') ? Number(variantInput.special_price) : productFields.special_price,
    wholesale_price: resolveWholesalePriceInput(variantInput) ?? productFields.wholesale_price,
    purchase_price: resolvePurchasePriceInput(variantInput) ?? productFields.purchase_price,
    expenses: has('expenses') ? Number(variantInput.expenses) : productFields.expenses,
    warranty:
      variantInput.warranty !== undefined && variantInput.warranty !== null && String(variantInput.warranty).trim() !== ''
        ? sanitizeWarranty(variantInput.warranty)
        : productFields.warranty ?? null,
  };
};

const mapIncomingCatalogFields = (data, target = {}) => {
  for (const key of CATALOG_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (key === 'warranty') {
        target.warranty = sanitizeWarranty(data.warranty, { required: false });
      } else {
        target[key] = data[key];
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(data, 'purchase_cost')) {
    target.purchase_price = data.purchase_cost;
  }
  return target;
};

const buildCatalogUpdatePayload = (current, incoming) => {
  const merged = {
    mrp: incoming.mrp ?? current.mrp,
    special_price: incoming.special_price ?? current.special_price,
    wholesale_price: incoming.wholesale_price ?? current.wholesale_price,
    purchase_price: incoming.purchase_price ?? current.purchase_price,
    expenses: incoming.expenses ?? current.expenses,
    warranty: incoming.warranty !== undefined ? incoming.warranty : current.warranty,
  };
  validateVariantPricing(merged);
  return merged;
};

const buildCsvVariantCatalog = (row, rowNumber) => {
  const indexLabel = `Row ${rowNumber}`;
  return extractCatalogFields(row, indexLabel, { required: true });
};

const stripWholesaleFromVariant = (variant) => {
  if (!variant || typeof variant !== 'object') return variant;
  const { wholesale_price, ...rest } = variant;
  return rest;
};

const stripWholesaleFromProduct = (product) => {
  if (!product || typeof product !== 'object') return product;
  const next = { ...product };
  delete next.wholesale_price;
  if (Array.isArray(next.variants)) {
    next.variants = next.variants.map(stripWholesaleFromVariant);
  }
  if (next.primary_variant) {
    next.primary_variant = stripWholesaleFromVariant(next.primary_variant);
  }
  return next;
};

const stripWholesaleFromShopStockRow = (stockRow) => {
  if (!stockRow?.variant) return stockRow;
  return {
    ...stockRow,
    variant: stripWholesaleFromVariant(stockRow.variant),
  };
};

let shopTypeCache = new Map();

const resolveHideWholesaleForUser = async (user) => {
  if (!user?.role || !SHOP_SCOPED_ROLES.has(user.role)) {
    return false;
  }

  const shopId = user.shopId || user.shop_id;
  if (!shopId) return false;

  if (shopTypeCache.has(shopId)) {
    return shopTypeCache.get(shopId) === 'FRANCHISE';
  }

  const shop = await prisma.shop.findUnique({
    where: { shop_id: shopId },
    select: { shop_type: true },
  });

  shopTypeCache.set(shopId, shop?.shop_type || 'OWNER');
  return shop?.shop_type === 'FRANCHISE';
};

const formatProductForUser = async (product, user) => {
  if (!product) return product;
  const hideWholesale = await resolveHideWholesaleForUser(user);
  return hideWholesale ? stripWholesaleFromProduct(product) : product;
};

const formatProductsForUser = async (products, user) => {
  if (!Array.isArray(products)) return products;
  const hideWholesale = await resolveHideWholesaleForUser(user);
  if (!hideWholesale) return products;
  return products.map(stripWholesaleFromProduct);
};

const formatShopStocksForUser = async (stocks, user) => {
  if (!Array.isArray(stocks)) return stocks;
  const hideWholesale = await resolveHideWholesaleForUser(user);
  if (!hideWholesale) return stocks;
  return stocks.map(stripWholesaleFromShopStockRow);
};

module.exports = {
  PRICE_FIELD_KEYS,
  VARIANT_REQUIRED_PRICE_KEYS,
  CATALOG_FIELD_KEYS,
  priceFieldPresent,
  sanitizeWarranty,
  resolvePurchasePriceInput,
  resolveWholesalePriceInput,
  validateVariantPricing,
  extractCatalogFields,
  sanitizeProductCatalogFields,
  mergeVariantCatalogFields,
  mapIncomingCatalogFields,
  buildCatalogUpdatePayload,
  buildCsvVariantCatalog,
  stripWholesaleFromProduct,
  stripWholesaleFromVariant,
  stripWholesaleFromShopStockRow,
  resolveHideWholesaleForUser,
  formatProductForUser,
  formatProductsForUser,
  formatShopStocksForUser,
};
