const { AppError } = require('../errors/AppError');

const ACTIVE_VARIANT_FILTER = {
  is_active: true,
  product: { is_active: true },
};

/**
 * Resolve a variant from a scanned code.
 * 1. Exact system_barcode or vendor_barcode match
 * 2. Numeric purchase_code only when exactly one active variant matches
 */
const resolveVariantByScanCode = async (db, code, { include, activeOnly = true } = {}) => {
  const trimmed = String(code).trim();
  const whereBase = activeOnly ? ACTIVE_VARIANT_FILTER : {};

  const byBarcode = await db.productVariant.findFirst({
    where: {
      ...whereBase,
      OR: [{ system_barcode: trimmed }, { vendor_barcode: trimmed }],
    },
    include,
  });
  if (byBarcode) return byBarcode;

  const purchaseCodeInt = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : null;
  if (purchaseCodeInt == null) return null;

  const matches = await db.productVariant.findMany({
    where: {
      ...whereBase,
      purchase_code: purchaseCodeInt,
    },
    include,
    orderBy: { product_code: 'asc' },
    take: 2,
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const allMatches = await db.productVariant.findMany({
    where: {
      ...whereBase,
      purchase_code: purchaseCodeInt,
    },
    select: {
      variant_id: true,
      product_code: true,
      product_id: true,
      system_barcode: true,
      purchase_code: true,
      product: { select: { name: true } },
    },
    orderBy: { product_code: 'asc' },
  });

  throw new AppError(
    `Purchase code ${purchaseCodeInt} matches multiple variants. Scan system_barcode or pick a variant.`,
    409,
    'AMBIGUOUS_PURCHASE_CODE',
    {
      purchase_code: purchaseCodeInt,
      variants: allMatches.map((v) => ({
        variant_id: v.variant_id,
        product_code: v.product_code,
        product_id: v.product_id,
        name: v.product?.name,
        system_barcode: v.system_barcode,
      })),
    }
  );
};

module.exports = {
  resolveVariantByScanCode,
};
