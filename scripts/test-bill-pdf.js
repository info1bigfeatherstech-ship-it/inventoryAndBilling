const prisma = require('../src/utils/prisma.utils');
const { buildBillPdfBuffer } = require('../src/services/billing/billPdf.service');

const BILL_SELECT = {
  bill_id: true,
  bill_number: true,
  bill_type: true,
  customer_mobile: true,
  customer_name: true,
  customer_gstin: true,
  place_of_supply_state_code: true,
  subtotal: true,
  discount: true,
  taxable_amount: true,
  gst_amount: true,
  total_amount: true,
  payment_method: true,
  paid_amount: true,
  balance_amount: true,
  created_at: true,
  shop: true,
  customer: true,
  gst_config: true,
  bank_account: true,
  items: {
    include: {
      variant: { include: { product: true } },
      product: true,
    },
  },
};

async function main() {
  const billId = process.argv[2] || 'cmq0y4muv0002thucg67x4def';
  const bill = await prisma.bill.findUnique({ where: { bill_id: billId }, select: BILL_SELECT });
  if (!bill) {
    console.error('Bill not found');
    process.exit(1);
  }
  console.log('bill_type', bill.bill_type, 'items', bill.items.length);
  try {
    const buf = await buildBillPdfBuffer(bill);
    console.log('OK buffer', buf.length);
  } catch (e) {
    console.error('FAIL', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
