const { buildBillPdfBuffer } = require('../src/services/billing/billPdf.service');

const baseBill = {
  bill_id: 'test',
  bill_number: 'INV-TEST-001',
  bill_type: 'GST_INVOICE',
  customer_mobile: '9876543210',
  customer_name: 'Test Customer',
  customer_gstin: null,
  place_of_supply_state_code: '06',
  subtotal: 1000,
  discount: 0,
  taxable_amount: 1000,
  gst_amount: 180,
  total_amount: 1180,
  payment_method: 'CASH',
  created_at: new Date(),
  shop: {
    shop_code: 'SHOP1',
    shop_name: 'Test Shop With A Very Long Name That Might Break Layout',
    address: '123 Main Street',
    city: 'Gurgaon',
    state_code: '06',
    phone: '9999999999',
    email: 'shop@test.com',
  },
  customer: { address: 'Addr', city: 'City', state_code: '07' },
  gst_config: { gst_number: '06ABCDE1234F1Z8', legal_name: 'Test Legal' },
  bank_account: {
    account_holder_name: 'Holder',
    bank_name: 'HDFC',
    account_number: '1234567890',
    ifsc_code: 'HDFC0001234',
    branch_name: 'Branch',
  },
  items: [],
};

async function run(label, bill) {
  try {
    const buf = await buildBillPdfBuffer(bill);
    console.log('OK', label, buf.length);
  } catch (e) {
    console.log('FAIL', label, e.message);
  }
}

async function main() {
  const item = {
    quantity: 2,
    unit_price: 500,
    mrp_unit_price: 600,
    hsn_code: '1234',
    gst_percent: 18,
    gst_type: 'CGST_SGST',
    tax_amount: 180,
    variant: { sku: 'SKU1', mrp: 600, product: { name: 'Product Name Here' } },
    product: { name: 'Product Name Here' },
  };

  await run('single item', { ...baseBill, items: [item] });

  const many = Array.from({ length: 55 }, (_, i) => ({
    ...item,
    variant: { ...item.variant, product: { name: `Product ${i + 1} with extra long name for wrap test` } },
  }));
  await run('55 items page break', { ...baseBill, items: many });

  await run('null amounts', {
    ...baseBill,
    subtotal: null,
    taxable_amount: null,
    gst_amount: null,
    total_amount: null,
    items: [{ ...item, tax_amount: null, gst_percent: null, gst_type: 'EXEMPT' }],
  });

  await run('IGST', {
    ...baseBill,
    items: [{ ...item, gst_type: 'IGST', tax_amount: 180 }],
  });

  await run('no shop gst', { ...baseBill, gst_config: null, items: [item] });
  await run('no bank', { ...baseBill, bank_account: null, items: [item] });
  await run('NON_GST', { ...baseBill, bill_type: 'NON_GST_INVOICE', items: [item] });
  await run('ESTIMATE', { ...baseBill, bill_type: 'ESTIMATE_INVOICE', items: [item] });
}

main();
