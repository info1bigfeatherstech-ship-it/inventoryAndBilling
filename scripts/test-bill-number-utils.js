/**
 * Bill number format tests (no DB).
 * Run: node scripts/test-bill-number-utils.js
 */
const {
  sanitizeShopCodeForBillNumber,
  buildBillNumberPrefix,
} = require('../src/utils/billNumber.utils');

let passed = 0;
let failed = 0;

const assert = (name, cond) => {
  if (cond) {
    passed += 1;
    console.log(`  OK ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
};

console.log('billNumber.utils\n');

assert('sanitizes spaces and case', sanitizeShopCodeForBillNumber(' del-01 ') === 'DEL-01');
assert('strips invalid chars', sanitizeShopCodeForBillNumber('Mum@Shop#2') === 'MUMSHOP2');

const d = new Date(2026, 5, 3);
const prefixA = buildBillNumberPrefix('SHOP-A', d);
const prefixB = buildBillNumberPrefix('SHOP-B', d);
assert('prefix includes shop slug', prefixA === 'INV-SHOP-A-20260603-');
assert('different shops different prefixes', prefixA !== prefixB);
assert('full number pattern', `${prefixA}0001` === 'INV-SHOP-A-20260603-0001');

let threw = false;
try {
  sanitizeShopCodeForBillNumber('   ');
} catch (e) {
  threw = e.code === 'SHOP_CODE_REQUIRED';
}
assert('empty shop code throws', threw);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
