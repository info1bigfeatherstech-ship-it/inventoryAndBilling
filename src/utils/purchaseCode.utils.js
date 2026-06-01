const PURCHASE_CODE_OFFSET = Number(process.env.PURCHASE_CODE_OFFSET || 1986);

/**
 * purchase_code = round(purchase_price + expenses + PURCHASE_CODE_OFFSET)
 * Label obfuscation only — not unique per variant; duplicates are expected.
 */
const computePurchaseCode = (purchasePrice, expenses) => {
  const total = Number(purchasePrice || 0) + Number(expenses || 0);
  return Math.round(total + PURCHASE_CODE_OFFSET);
};

const withComputedPurchaseCode = (prices) => {
  const purchaseCode = computePurchaseCode(prices.purchase_price, prices.expenses);
  return { ...prices, purchase_code: purchaseCode };
};

module.exports = {
  PURCHASE_CODE_OFFSET,
  computePurchaseCode,
  withComputedPurchaseCode,
};
