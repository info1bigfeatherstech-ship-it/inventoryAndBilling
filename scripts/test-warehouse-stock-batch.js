/**
 * Warehouse stock batch logic (aggregate vs explicit batch).
 * Run: node scripts/test-warehouse-stock-batch.js
 */
require('dotenv').config();
const prisma = require('../src/utils/prisma.utils');
const {
  isBatchSpecified,
  getWarehouseStockAvailable,
  assertWarehouseStockAvailable,
  deductWarehouseStock,
} = require('../src/utils/warehouseStock.utils');

let passed = 0;
let failed = 0;

const ok = (label) => {
  console.log(`OK: ${label}`);
  passed += 1;
};

const fail = (label, err) => {
  console.error(`FAIL: ${label}`, err?.message || err);
  failed += 1;
};

const assertEq = (label, actual, expected) => {
  if (actual === expected) ok(label);
  else fail(label, new Error(`expected ${expected}, got ${actual}`));
};

async function main() {
  assertEq('isBatchSpecified empty', isBatchSpecified(''), false);
  assertEq('isBatchSpecified batch1', isBatchSpecified('batch1'), true);

  const stock = await prisma.productStock.findFirst({
    where: { quantity: { gt: 0 } },
    select: {
      variant_id: true,
      warehouse_id: true,
      batch_number: true,
      quantity: true,
      product_id: true,
    },
  });

  if (!stock) {
    console.log('SKIP: no product_stocks with quantity > 0 in DB — seed stock first');
    process.exit(0);
  }

  const { variant_id, warehouse_id, batch_number } = stock;

  await prisma.$transaction(async (tx) => {
    const totalAll = await getWarehouseStockAvailable(tx, variant_id, warehouse_id, '');
    const totalExplicit = await getWarehouseStockAvailable(tx, variant_id, warehouse_id, batch_number);
    const totalEmptyOnly = await getWarehouseStockAvailable(tx, variant_id, warehouse_id, '');

    if (totalAll >= stock.quantity) {
      ok(`aggregate available (${totalAll}) >= sample row qty (${stock.quantity})`);
    } else {
      fail('aggregate available', new Error(`${totalAll} < ${stock.quantity}`));
    }

    if (batch_number !== '') {
      const wrongBatch = await getWarehouseStockAvailable(tx, variant_id, warehouse_id, '__nonexistent_batch__');
      assertEq('explicit missing batch is 0', wrongBatch, 0);
    }

    try {
      await assertWarehouseStockAvailable(tx, variant_id, warehouse_id, totalAll + 1, '');
      fail('assert should throw when qty > total');
    } catch (e) {
      if (e.code === 'INSUFFICIENT_STOCK') ok('assert throws INSUFFICIENT_STOCK when over-allocated');
      else fail('assert throws INSUFFICIENT_STOCK', e);
    }

    await assertWarehouseStockAvailable(tx, variant_id, warehouse_id, 1, '');
    ok('assert passes for qty 1 when aggregate has stock');

    throw new Error('ROLLBACK_TEST_TX');
  }).catch((e) => {
    if (e.message === 'ROLLBACK_TEST_TX') ok('transaction rolled back (no data changed)');
    else throw e;
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
