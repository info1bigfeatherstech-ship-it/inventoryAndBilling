/** Shop code: 3–20 chars, uppercase letters, digits, underscore only. */
const SHOP_CODE_PATTERN = /^[A-Z0-9_]{3,20}$/;

const SHOP_CODE_FORMAT_HINT = '3–20 uppercase letters, numbers, or underscore (e.g. SHOP_DL_001)';

const SHOP_CODE_PLACEHOLDER = 'e.g. SHOP_DL_001';

const normalizeShopCode = (value) => String(value || '').trim().toUpperCase();

const assertValidShopCode = (shopCode) => {
  if (!shopCode) return false;
  return SHOP_CODE_PATTERN.test(shopCode);
};

module.exports = {
  SHOP_CODE_PATTERN,
  SHOP_CODE_FORMAT_HINT,
  SHOP_CODE_PLACEHOLDER,
  normalizeShopCode,
  assertValidShopCode,
};
