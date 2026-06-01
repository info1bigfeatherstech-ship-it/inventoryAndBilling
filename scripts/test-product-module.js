/**
 * Smoke test for product create, variant add, bulk CSV, and purchase_code scan rules.
 * Run: node scripts/test-product-module.js
 */
const prisma = require('../src/utils/prisma.utils');
const ProductService = require('../src/services/product/product.service');
const { computePurchaseCode, withComputedPurchaseCode } = require('../src/utils/purchaseCode.utils');

const assertPurchaseCodeFormula = () => {
  if (computePurchaseCode(100, 20) !== 2106) {
    throw new Error('computePurchaseCode(100, 20) should be 2106');
  }
  const priced = withComputedPurchaseCode({ mrp: 999, special_price: 899, purchase_price: 100, expenses: 20 });
  if (priced.purchase_code !== 2106) {
    throw new Error('withComputedPurchaseCode should attach purchase_code 2106');
  }
};

const expectSamePurchaseCode = (variants, label) => {
  const codes = variants.map((v) => v.purchase_code);
  const unique = new Set(codes);
  if (unique.size !== 1) {
    throw new Error(`${label}: expected same purchase_code on all variants, got ${codes.join(', ')}`);
  }
  const expected = computePurchaseCode(variants[0].purchase_price, variants[0].expenses);
  if (codes[0] !== expected) {
    throw new Error(`${label}: expected purchase_code ${expected}, got ${codes[0]}`);
  }
  return codes[0];
};

const expectAmbiguousPurchaseCodeScan = async (purchaseCode) => {
  let ambiguous = false;
  try {
    await ProductService.getProductByBarcode(String(purchaseCode));
  } catch (err) {
    ambiguous = err.code === 'AMBIGUOUS_PURCHASE_CODE';
  }
  if (!ambiguous) {
    throw new Error(`Expected AMBIGUOUS_PURCHASE_CODE when scanning shared purchase_code ${purchaseCode}`);
  }
};

const ensureTestFixtures = async () => {
  let warehouse = await prisma.warehouse.findFirst({ where: { is_active: true } });
  let vendor = await prisma.vendor.findFirst({ where: { is_active: true } });
  let category = await prisma.category.findFirst({ where: { is_active: true, parent_id: null } });

  const tag = String(Date.now());

  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        warehouse_code: `WH-TST-${tag}`,
        warehouse_name: 'Test Warehouse',
        address: 'Test Address',
        city: 'Test City',
      },
    });
  }

  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        company_name: `Test Vendor ${tag}`,
        phone: `9${tag.slice(-9)}`,
        supply_city: 'Test City',
        business_type: 'WHOLESALER',
        city: 'Test City',
      },
    });
  }

  if (!category) {
    category = await prisma.category.create({
      data: { name: `Test Category ${tag}` },
    });
  }

  return { warehouse, vendor, category };
};

const run = async () => {
  assertPurchaseCodeFormula();

  const { warehouse, vendor, category } = await ensureTestFixtures();
  const user = { role: 'WH_MANAGER', warehouseId: warehouse.warehouse_id, userId: 'test' };
  const code = `TST-${Date.now()}`;
  const pricePayload = {
    mrp: 999,
    special_price: 899,
    purchase_price: 100,
    expenses: 20,
  };

  const created = await ProductService.createProduct(
    {
      product_code: code,
      name: `Test Product ${code}`,
      primary_vendor_id: vendor.vendor_id,
      hsn_code: '6109',
      gst_percent: 12,
      gst_type: 'CGST_SGST',
      unit_of_measure: 'PCS',
      category_id: category.category_id,
      variants: [
        {
          sku: `${code}-RED`,
          system_barcode: `BC-${code}-RED`,
          ...pricePayload,
          weight: 0.2,
          length: 10,
          width: 10,
          height: 2,
          attributes: [{ key: 'Color', value: 'Red' }],
          is_default: true,
        },
        {
          sku: `${code}-BLUE`,
          system_barcode: `BC-${code}-BLUE`,
          ...pricePayload,
          weight: 0.2,
          length: 10,
          width: 10,
          height: 2,
          attributes: [{ key: 'Color', value: 'Blue' }],
        },
      ],
    },
    user
  );

  const sharedPc = expectSamePurchaseCode(created.variants, 'createProduct');

  const bySystemBarcode = await ProductService.getProductByBarcode(created.variants[0].system_barcode);
  await expectAmbiguousPurchaseCodeScan(sharedPc);

  const addedVariant = await ProductService.createVariant(
    created.product_id,
    {
      sku: `${code}-GREEN`,
      system_barcode: `BC-${code}-GREEN`,
      ...pricePayload,
      weight: 0.2,
      length: 10,
      width: 10,
      height: 2,
      attributes: [{ key: 'Color', value: 'Green' }],
    },
    user
  );

  if (addedVariant.variants.find((v) => v.sku === `${code}-GREEN`)?.purchase_code !== sharedPc) {
    throw new Error('createVariant: expected same purchase_code as siblings with same pricing');
  }

  const bulkCode = `BLK-${Date.now()}`;
  const csvContent = [
    'name,title,description,brand_name,product_code,vendor_name,category_name,sub_category_name,mrp,special_price,purchase_price,expenses,hsn_code,gst_percent,gst_type,unit_of_measure,weight,length,width,height,low_stock_threshold,remarks',
    `Bulk Test ${bulkCode},Bulk title,Desc,Generic,${bulkCode}-1,${vendor.company_name},${category.name},,999,899,100,20,6109,12,CGST_SGST,PCS,200,10,10,2,10,bulk row 1`,
    `Bulk Test ${bulkCode},Bulk title 2,Desc,Generic,${bulkCode}-2,${vendor.company_name},${category.name},,999,899,100,20,6109,12,CGST_SGST,PCS,200,10,10,2,10,bulk row 2`,
  ].join('\n');

  const preview = await ProductService.bulkCreateFromCsv(Buffer.from(csvContent), user, { preview: true });
  const previewRow = preview.preview.rows.find((r) => r.name === `Bulk Test ${bulkCode}`);
  if (!previewRow || previewRow.variants_count !== 2) {
    throw new Error('bulk preview: expected one product group with 2 variants');
  }
  expectSamePurchaseCode(previewRow.variants, 'bulk preview');

  const bulkResult = await ProductService.bulkCreateFromCsv(Buffer.from(csvContent), user);
  if (bulkResult.created !== 1) {
    throw new Error(`bulk create: expected 1 product created, got ${bulkResult.created}`);
  }

  const bulkProduct = await prisma.product.findFirst({
    where: { warehouse_id: warehouse.warehouse_id, name: `Bulk Test ${bulkCode}` },
    include: { variants: { select: { purchase_code: true, purchase_price: true, expenses: true } } },
  });
  if (!bulkProduct || bulkProduct.variants.length !== 2) {
    throw new Error('bulk create: product or variants missing in DB');
  }
  expectSamePurchaseCode(bulkProduct.variants, 'bulk create');

  const listed = await ProductService.listProducts({ search: code }, user);
  const fetched = await ProductService.getProductById(created.product_id, user, { bypassCache: true });

  await ProductService.softDeleteProduct(created.product_id, user);
  await ProductService.softDeleteProduct(bulkProduct.product_id, user);

  console.log('PASS product module smoke test', {
    product_id: created.product_id,
    variants: created.variants?.length,
    shared_purchase_code: sharedPc,
    bulk_product_id: bulkProduct.product_id,
    list_total: listed.total,
    fetched_name: fetched.name,
    barcode_lookup: bySystemBarcode.product_code,
  });
};

run()
  .catch((error) => {
    console.error('FAIL', error.message, error.code);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
