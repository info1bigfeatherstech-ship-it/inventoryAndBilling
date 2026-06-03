/**
 * Guards GST % math: 12 means 12%, not multiply by 12.
 * Run: node scripts/test-gst-percent-calc.js
 */
const calc = (taxable, percent) =>
  Math.round(((taxable * percent) / 100) * 100 + Number.EPSILON) / 100;

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

assert('999 @ 12% = 119.88', calc(999, 12) === 119.88);
assert('999 + 119.88 = 1118.88', calc(999, 12) + 999 === 1118.88);
assert('wrong formula 999*12 blocked', calc(999, 12) !== 11988);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
