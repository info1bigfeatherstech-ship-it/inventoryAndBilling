const { AppError } = require('../errors/AppError');

const VARIANT_SELECT = {
  variant_id: true,
  product_id: true,
  product_code: true,
  sku: true,
  system_barcode: true,
  is_active: true,
  is_default: true,
  low_stock_threshold: true,
};

/**
 * Active variants for a product (inward mapping picker).
 */
const listActiveVariantsForProduct = async (tx, productId) =>
  tx.productVariant.findMany({
    where: { product_id: productId, is_active: true },
    orderBy: [{ is_default: 'desc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    select: VARIANT_SELECT,
  });

/**
 * Validate mapped variant belongs to product and is active.
 */
const assertMappedVariantForProduct = async (tx, { productId, variantId, warehouseId }) => {
  if (!productId) {
    throw new AppError('mapped_product_id is required when setting mapped_variant_id', 400, 'MAPPED_PRODUCT_REQUIRED');
  }
  if (!variantId) {
    throw new AppError('mapped_variant_id is required for this product', 400, 'MAPPED_VARIANT_REQUIRED');
  }

  const variant = await tx.productVariant.findUnique({
    where: { variant_id: variantId },
    select: {
      ...VARIANT_SELECT,
      product: { select: { product_id: true, warehouse_id: true, is_active: true } },
    },
  });

  if (!variant || !variant.is_active) {
    throw new AppError('Variant not found or inactive', 404, 'VARIANT_NOT_FOUND');
  }
  if (variant.product_id !== productId) {
    throw new AppError('Variant does not belong to the mapped product', 409, 'VARIANT_PRODUCT_MISMATCH');
  }
  if (!variant.product?.is_active) {
    throw new AppError('Mapped product is inactive', 409, 'PRODUCT_INACTIVE');
  }
  if (warehouseId && variant.product.warehouse_id !== warehouseId) {
    throw new AppError('Variant product belongs to a different warehouse', 409, 'PRODUCT_WAREHOUSE_MISMATCH');
  }

  return variant;
};

/**
 * Resolve variant id when saving inward mapping (auto-pick if single SKU).
 */
const resolveMappedVariantOnSave = async (tx, { productId, variantId, warehouseId }) => {
  const variants = await listActiveVariantsForProduct(tx, productId);
  if (!variants.length) {
    throw new AppError('Product has no active variant', 409, 'MAPPED_PRODUCT_NO_VARIANT');
  }

  if (variants.length === 1) {
    return variants[0].variant_id;
  }

  if (!variantId) {
    throw new AppError(
      'Select a variant (SKU) for this product — multiple variants exist',
      409,
      'VARIANT_SELECTION_REQUIRED',
      { variant_count: variants.length }
    );
  }

  await assertMappedVariantForProduct(tx, { productId, variantId, warehouseId });
  return variantId;
};

/**
 * Resolve which variant receives stock when inward is marked MAPPED.
 */
const resolveVariantForInwardItem = async (tx, item) => {
  const productId = item.mapped_product_id;
  if (!productId) {
    throw new AppError('Inward item has no mapped product', 400, 'INWARD_ITEM_NOT_MAPPED');
  }

  if (item.mapped_variant_id) {
    const variant = await assertMappedVariantForProduct(tx, {
      productId,
      variantId: item.mapped_variant_id,
      warehouseId: null,
    });
    return {
      variant_id: variant.variant_id,
      product_id: variant.product_id,
      low_stock_threshold: variant.low_stock_threshold,
    };
  }

  const variants = await listActiveVariantsForProduct(tx, productId);
  if (variants.length === 1) {
    const v = variants[0];
    return {
      variant_id: v.variant_id,
      product_id: v.product_id,
      low_stock_threshold: v.low_stock_threshold,
    };
  }

  if (variants.length > 1) {
    const variantText = item.variant_text ? String(item.variant_text).trim() : '';
    if (variantText) {
      const matched = await tx.productVariant.findFirst({
        where: {
          product_id: productId,
          is_active: true,
          OR: [
            { product_code: { equals: variantText, mode: 'insensitive' } },
            { sku: { equals: variantText, mode: 'insensitive' } },
            { system_barcode: { equals: variantText, mode: 'insensitive' } },
          ],
        },
        select: VARIANT_SELECT,
      });
      if (matched) {
        return {
          variant_id: matched.variant_id,
          product_id: matched.product_id,
          low_stock_threshold: matched.low_stock_threshold,
        };
      }
    }

    throw new AppError(
      `Inward line "${item.item_name || item.inward_item_id}" requires variant selection — product has ${variants.length} active variants`,
      409,
      'INWARD_VARIANT_REQUIRED',
      { product_id: productId, variant_count: variants.length }
    );
  }

  throw new AppError('Mapped product has no active variant for stock', 409, 'MAPPED_PRODUCT_NO_VARIANT');
};

/**
 * Before MAPPED: ensure every line can resolve to a variant.
 */
const assertAllInwardItemsHaveVariantMapping = async (tx, inwardId) => {
  const items = await tx.inwardReceiptItem.findMany({
    where: { inward_id: inwardId },
    select: {
      inward_item_id: true,
      item_name: true,
      mapped_product_id: true,
      mapped_variant_id: true,
      variant_text: true,
    },
  });

  for (const item of items) {
    if (!item.mapped_product_id) continue;
    try {
      await resolveVariantForInwardItem(tx, item);
    } catch (err) {
      if (err.code === 'INWARD_VARIANT_REQUIRED') {
        throw new AppError(
          `Line "${item.item_name}": select variant (SKU) before completing mapping`,
          409,
          'INWARD_VARIANT_REQUIRED',
          { inward_item_id: item.inward_item_id }
        );
      }
      throw err;
    }
  }
};

module.exports = {
  listActiveVariantsForProduct,
  assertMappedVariantForProduct,
  resolveMappedVariantOnSave,
  resolveVariantForInwardItem,
  assertAllInwardItemsHaveVariantMapping,
};
