/**
 * Stock search scope rules (no DB for WH roles).
 * Run: node scripts/test-stock-search-scope.js
 */
const { resolveStockSearchScope } = require('../src/utils/stockSearchScope.utils');

let passed = 0;
let failed = 0;

const ok = (label) => {
  console.log(`OK: ${label}`);
  passed += 1;
};

const fail = (label, msg) => {
  console.error(`FAIL: ${label} — ${msg}`);
  failed += 1;
};

const assertScope = async (label, user, query, expected) => {
  const scope = await resolveStockSearchScope(user, query);
  const checks = [
    ['includeWarehouses', expected.includeWarehouses],
    ['includeShops', expected.includeShops],
    ['excludeWarehouseIds', expected.excludeWarehouseIds],
    ['requestType', expected.requestType],
  ];
  for (const [key, exp] of checks) {
    const act = scope[key];
    const match = JSON.stringify(act) === JSON.stringify(exp);
    if (!match) {
      fail(label, `${key}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`);
      return;
    }
  }
  ok(label);
};

async function main() {
  const whManager = {
    role: 'WH_MANAGER',
    userId: 'u1',
    warehouseId: 'wh-own',
    shopId: null,
  };

  await assertScope('WH_MANAGER default → WH_TO_WH scope', whManager, {}, {
    requestType: 'WH_TO_WH',
    includeWarehouses: true,
    includeShops: false,
    excludeWarehouseIds: ['wh-own'],
  });

  await assertScope('WH_MANAGER explicit WH_TO_WH', whManager, { request_type: 'WH_TO_WH' }, {
    requestType: 'WH_TO_WH',
    includeWarehouses: true,
    includeShops: false,
    excludeWarehouseIds: ['wh-own'],
  });

  await assertScope('WH_STOCK_LISTER default', { role: 'WH_STOCK_LISTER', warehouseId: 'wh2' }, {}, {
    requestType: 'WH_TO_WH',
    includeWarehouses: true,
    includeShops: false,
    excludeWarehouseIds: ['wh2'],
  });

  await assertScope('SUPER_ADMIN sees all', { role: 'SUPER_ADMIN' }, {}, {
    requestType: null,
    includeWarehouses: true,
    includeShops: true,
    excludeWarehouseIds: [],
  });

  await assertScope('SHOP_TO_SHOP hides warehouses', whManager, { request_type: 'SHOP_TO_SHOP' }, {
    requestType: 'SHOP_TO_SHOP',
    includeWarehouses: false,
    includeShops: true,
    excludeWarehouseIds: [],
  });

  try {
    await resolveStockSearchScope(whManager, { request_type: 'INVALID' });
    fail('invalid request_type throws', 'expected error');
  } catch (e) {
    if (e.code === 'INVALID_REQUEST_TYPE') ok('invalid request_type throws INVALID_REQUEST_TYPE');
    else fail('invalid request_type throws', e.message);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
