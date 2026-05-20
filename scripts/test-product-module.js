/**
 * Smoke test for product + variant create/list (run: node scripts/test-product-module.js)
 */
const prisma = require('../src/utils/prisma.utils');
const ProductService = require('../src/services/product/product.service');

const run = async () => {
  const warehouse = await prisma.warehouse.findFirst({ where: { is_active: true } });
  const vendor = await prisma.vendor.findFirst({ where: { is_active: true } });
  const category = await prisma.category.findFirst({ where: { is_active: true, parent_id: null } });

  if (!warehouse || !vendor || !category) {
    console.log('SKIP: need at least one warehouse, vendor, and root category');
    return;
  }

  const user = { role: 'WH_MANAGER', warehouseId: warehouse.warehouse_id, userId: 'test' };
  const code = `TST-${Date.now()}`;

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
          mrp: 999,
          wholesale_price: 700,
          retail_price: 899,
          attributes: [{ key: 'Color', value: 'Red' }],
          is_default: true,
        },
        {
          sku: `${code}-BLUE`,
          system_barcode: `BC-${code}-BLUE`,
          mrp: 999,
          wholesale_price: 700,
          retail_price: 899,
          attributes: [{ key: 'Color', value: 'Blue' }],
        },
      ],
      initial_stock: { quantity: 5, room_zone: 'A', rack_shelf: 'R1' },
    },
    user
  );

  const listed = await ProductService.listProducts({ search: code }, user);
  const fetched = await ProductService.getProductById(created.product_id, user, { bypassCache: true });

  await ProductService.softDeleteProduct(created.product_id, user);

  console.log('PASS product module smoke test', {
    product_id: created.product_id,
    variants: created.variants?.length,
    list_total: listed.total,
    fetched_name: fetched.name,
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
