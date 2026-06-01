const { AppError } = require('../middlewares/error.middleware');

const PURCHASE_CODE_OFFSET = Number(process.env.PURCHASE_CODE_OFFSET || 1986);

/**
 * purchase_code = round(purchase_price + expenses + PURCHASE_CODE_OFFSET)
 */
const computePurchaseCode = (purchasePrice, expenses) => {
  const total = Number(purchasePrice || 0) + Number(expenses || 0);
  return Math.round(total + PURCHASE_CODE_OFFSET);
};

const assertPurchaseCodeUnique = async (tx, purchaseCode, { excludeVariantId } = {}) => {
  const existing = await tx.productVariant.findFirst({
    where: {
      purchase_code: purchaseCode,
      ...(excludeVariantId ? { variant_id: { not: excludeVariantId } } : {}),
    },
    select: { variant_id: true, product_code: true },
  });

  if (existing) {
    throw new AppError(
      `Purchase code ${purchaseCode} is already used by variant ${existing.product_code}. Adjust purchase price or expenses.`,
      409,
      'PURCHASE_CODE_COLLISION'
    );
  }
};

const withComputedPurchaseCode = async (tx, prices, { excludeVariantId } = {}) => {
  const purchaseCode = computePurchaseCode(prices.purchase_price, prices.expenses);
  await assertPurchaseCodeUnique(tx, purchaseCode, { excludeVariantId });
  return { ...prices, purchase_code: purchaseCode };
};

module.exports = {
  PURCHASE_CODE_OFFSET,
  computePurchaseCode,
  assertPurchaseCodeUnique,
  withComputedPurchaseCode,
};
