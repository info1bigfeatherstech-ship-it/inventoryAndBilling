/**
 * Cross-shop credit note flow (unit-style, no HTTP).
 * Run: node scripts/test-cross-shop-credit-note.js
 */
const {
  getCreditNoteBalance,
  deriveCreditNoteStatus,
} = require('../src/utils/creditNote.utils');
const { assertCreditNoteRedeemable, REDEEMABLE_STATUSES } = require('../src/utils/creditNoteAccess.utils');

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

console.log('Cross-shop credit note helpers\n');

const cn = {
  credit_note_id: 'cn_1',
  credit_note_number: 'CN-20260603-0001',
  shop_id: 'shop_a',
  status: 'ACTIVE',
  credit_amount: 1000,
  amount_redeemed: 0,
  amount_refunded: 0,
  customer_id: 'cust_1',
  customer_mobile: '9876543210',
};

assert('balance is full amount', getCreditNoteBalance(cn) === 1000);

let threw = false;
try {
  assertCreditNoteRedeemable(cn, { customerId: 'cust_2', customerMobile: null });
} catch (e) {
  threw = e.code === 'CREDIT_NOTE_CUSTOMER_MISMATCH';
}
assert('rejects wrong customer_id', threw);

assert('allows matching customer at different shop', (() => {
  try {
    assertCreditNoteRedeemable(cn, { customerId: 'cust_1', customerMobile: '9876543210' });
    return true;
  } catch {
    return false;
  }
})());

const partial = { ...cn, amount_redeemed: 600, status: 'PARTIALLY_REDEEMED' };
assert('partial balance 400', getCreditNoteBalance(partial) === 400);
assert('partial still redeemable status', REDEEMABLE_STATUSES.has(partial.status));
assert(
  'derive PARTIALLY_REDEEMED',
  deriveCreditNoteStatus({ ...partial, amount_redeemed: 600 }) === 'PARTIALLY_REDEEMED'
);
assert(
  'derive REDEEMED when fully used',
  deriveCreditNoteStatus({ ...cn, amount_redeemed: 1000 }) === 'REDEEMED'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
