const { AppError } = require('../errors/AppError');
const { resolveDefaultVariantForProduct } = require('./inwardPurchase.utils');

const VARIANT_SELECT = {
  variant_id: true,
  sku: true,
  product_code: true,
  is_active: true,
  product_id: true,
};

/**
 * Variants that received stock on this purchase (from PURCHASE ledger).
 * @returns {Promise<Map<string, number>>} variant_id → qty received
 */
const getPurchaseLedgerVariantQty = async (tx, purchaseId, productId) => {
  const rows = await tx.stockLedger.findMany({
    where: {
      reference_id: purchaseId,
      reference_type: 'PURCHASE_ENTRY',
      product_id: productId,
      movement_type: 'PURCHASE',
      variant_id: { not: null },
    },
    select: { variant_id: true, quantity: true },
  });

  const map = new Map();
  for (const row of rows) {
    map.set(row.variant_id, (map.get(row.variant_id) || 0) + row.quantity);
  }
  return map;
};

/**
 * Resolve which variant a purchase line refers to (SKU-level returns).
 * @param {import('@prisma/client').Prisma.TransactionClient | import('@prisma/client').PrismaClient} tx
 */
const resolvePurchaseItemVariant = async (tx, { purchaseItem, purchaseId }) => {
  if (purchaseItem.variant_id) {
    const variant = await tx.productVariant.findUnique({
      where: { variant_id: purchaseItem.variant_id },
      select: VARIANT_SELECT,
    });
    if (variant?.is_active) {
      return {
        variant_id: variant.variant_id,
        sku: variant.sku,
        product_code: variant.product_code,
        requires_variant_pick: false,
        variant_options: [],
        resolution_source: 'purchase_line',
      };
    }
  }

  const ledgerQty = await getPurchaseLedgerVariantQty(tx, purchaseId, purchaseItem.product_id);
  const ledgerVariantIds = [...ledgerQty.keys()];

  if (ledgerVariantIds.length === 1) {
    const variant = await tx.productVariant.findUnique({
      where: { variant_id: ledgerVariantIds[0] },
      select: VARIANT_SELECT,
    });
    if (variant?.is_active) {
      return {
        variant_id: variant.variant_id,
        sku: variant.sku,
        product_code: variant.product_code,
        requires_variant_pick: false,
        variant_options: [],
        resolution_source: 'purchase_ledger',
      };
    }
  }

  if (ledgerVariantIds.length > 1) {
    const variants = await tx.productVariant.findMany({
      where: { variant_id: { in: ledgerVariantIds }, is_active: true },
      select: VARIANT_SELECT,
      orderBy: [{ is_default: 'desc' }, { sort_order: 'asc' }],
    });

    return {
      variant_id: null,
      sku: null,
      product_code: null,
      requires_variant_pick: true,
      variant_options: variants.map((v) => ({
        variant_id: v.variant_id,
        sku: v.sku,
        product_code: v.product_code,
        received_quantity: ledgerQty.get(v.variant_id) || 0,
      })),
      resolution_source: 'multi_variant',
    };
  }

  const defaultVariant = await resolveDefaultVariantForProduct(tx, purchaseItem.product_id);
  if (defaultVariant?.variant_id) {
    const variant = await tx.productVariant.findUnique({
      where: { variant_id: defaultVariant.variant_id },
      select: VARIANT_SELECT,
    });
    if (variant?.is_active) {
      return {
        variant_id: variant.variant_id,
        sku: variant.sku,
        product_code: variant.product_code,
        requires_variant_pick: false,
        variant_options: [],
        resolution_source: 'default_variant',
      };
    }
  }

  return {
    variant_id: null,
    sku: null,
    product_code: null,
    requires_variant_pick: false,
    variant_options: [],
    resolution_source: 'unresolved',
  };
};

/**
 * Pick variant for debit note line (request may override when multiple SKUs).
 */
const assertResolvedVariantForReturn = async (tx, {
  purchaseItem,
  purchaseId,
  requestedVariantId,
}) => {
  const resolution = await resolvePurchaseItemVariant(tx, { purchaseItem, purchaseId });

  if (resolution.requires_variant_pick) {
    if (!requestedVariantId) {
      throw new AppError(
        `Product "${purchaseItem.product?.name || purchaseItem.product_id}" has multiple variants on this purchase — select a variant (SKU)`,
        409,
        'VARIANT_SELECTION_REQUIRED',
        { purchase_item_id: purchaseItem.purchase_item_id, variant_options: resolution.variant_options }
      );
    }
    const allowed = resolution.variant_options.some((o) => o.variant_id === requestedVariantId);
    if (!allowed) {
      throw new AppError('Selected variant is not valid for this purchase line', 409, 'INVALID_VARIANT_FOR_LINE');
    }
    const variant = await tx.productVariant.findUnique({
      where: { variant_id: requestedVariantId },
      select: VARIANT_SELECT,
    });
    if (!variant?.is_active) {
      throw new AppError('Selected variant is inactive', 409, 'VARIANT_INACTIVE');
    }
    return { variant, resolution_source: 'user_selected' };
  }

  if (!resolution.variant_id) {
    throw new AppError(
      `No active variant found for purchase line ${purchaseItem.purchase_item_id}`,
      409,
      'PURCHASE_ITEM_NO_VARIANT'
    );
  }

  if (requestedVariantId && requestedVariantId !== resolution.variant_id) {
    throw new AppError(
      'variant_id does not match the variant recorded for this purchase line',
      409,
      'VARIANT_MISMATCH'
    );
  }

  const variant = await tx.productVariant.findUnique({
    where: { variant_id: resolution.variant_id },
    select: VARIANT_SELECT,
  });

  if (!variant?.is_active) {
    throw new AppError('Resolved variant is inactive', 409, 'VARIANT_INACTIVE');
  }

  return { variant, resolution_source: resolution.resolution_source };
};

/**
 * Backfill missing variant_id on legacy purchase_items when we resolved from ledger/default.
 */
const backfillPurchaseItemVariantIfMissing = async (tx, purchaseItemId, variantId, existingVariantId) => {
  if (existingVariantId || !variantId) return;
  await tx.purchaseItem.update({
    where: { purchase_item_id: purchaseItemId },
    data: { variant_id: variantId },
  });
};

module.exports = {
  getPurchaseLedgerVariantQty,
  resolvePurchaseItemVariant,
  assertResolvedVariantForReturn,
  backfillPurchaseItemVariantIfMissing,
};
