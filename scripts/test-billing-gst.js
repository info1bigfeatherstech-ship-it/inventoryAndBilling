/**
 * GST billing utility tests (product gst_type + gst_percent).
 * Run: node scripts/test-billing-gst.js
 */
const {
  splitTaxByProductGstType,
  splitLineTaxDisplay,
  buildTaxSummaryFromLines,
  calculateLineAmounts,
  normalizeProductGstType,
} = require('../src/utils/billing.utils');

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

console.log('billing GST utils (product-based)\n');

assert('CGST_SGST splits 50-50', (() => {
  const s = splitTaxByProductGstType(120, 'CGST_SGST');
  return s.cgst === 60 && s.sgst === 60 && s.igst === 0;
})());

assert('IGST all to igst', (() => {
  const s = splitTaxByProductGstType(120, 'IGST');
  return s.igst === 120 && s.cgst === 0;
})());

const cgstLine = calculateLineAmounts({
  quantity: 1,
  unitPrice: 999,
  gstPercent: 12,
  gstType: 'CGST_SGST',
  billType: 'GST_INVOICE',
});
assert('GST invoice CGST line', cgstLine.tax_amount === 119.88 && cgstLine.gst_type === 'CGST_SGST');

const igstLine = calculateLineAmounts({
  quantity: 1,
  unitPrice: 1000,
  gstPercent: 18,
  gstType: 'IGST',
  billType: 'GST_INVOICE',
});
assert('GST invoice IGST line', igstLine.tax_amount === 180 && igstLine.tax_mode === 'IGST');

const noGstLine = calculateLineAmounts({
  quantity: 1,
  unitPrice: 999,
  gstPercent: 12,
  gstType: 'CGST_SGST',
  billType: 'NON_GST_INVOICE',
});
assert('non-GST bill no tax', noGstLine.tax_amount === 0 && noGstLine.line_total === 999);

const summary = buildTaxSummaryFromLines([
  { gst_type: 'CGST_SGST', tax_amount: 60 },
  { gst_type: 'IGST', tax_amount: 180 },
]);
assert('mixed bill summary', summary.cgst === 30 && summary.sgst === 30 && summary.igst === 180);

const lineDisplay = splitLineTaxDisplay(90, 18, 'CGST_SGST');
assert('line display CGST', lineDisplay.cgst === 45 && lineDisplay.igst === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
