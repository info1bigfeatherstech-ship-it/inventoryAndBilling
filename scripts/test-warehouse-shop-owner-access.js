/**
 * Shop owner must list warehouses for transfer source picker.
 * Run: node scripts/test-warehouse-shop-owner-access.js
 */
const { applyWarehouseListScope, assertCanReadWarehouse } = require('../src/utils/warehouseAccess.utils');

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

function main() {
  const shopOwner = { role: 'SHOP_OWNER', warehouseId: null, shopId: 'shop_1' };

  try {
    const where = { is_active: true };
    applyWarehouseListScope(where, shopOwner);
    if (where.warehouse_id) {
      fail('SHOP_OWNER list scope', 'should not restrict to single warehouse_id');
    } else {
      ok('SHOP_OWNER can list all active warehouses');
    }
  } catch (e) {
    fail('SHOP_OWNER list scope', e.message);
  }

  try {
    assertCanReadWarehouse(shopOwner, 'wh_any');
    ok('SHOP_OWNER can read warehouse by id');
  } catch (e) {
    fail('SHOP_OWNER read by id', e.message);
  }

  const whManager = { role: 'WH_MANAGER', warehouseId: 'wh_own' };
  try {
    const where = {};
    applyWarehouseListScope(where, whManager);
    if (where.warehouse_id !== 'wh_own') {
      fail('WH_MANAGER scope', `expected wh_own, got ${where.warehouse_id}`);
    } else {
      ok('WH_MANAGER still scoped to own warehouse');
    }
  } catch (e) {
    fail('WH_MANAGER scope', e.message);
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
