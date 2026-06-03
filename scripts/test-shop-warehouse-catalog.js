/**
 * Shop warehouse stock catalog — mode filters + optional API smoke test.
 * Run: node scripts/test-shop-warehouse-catalog.js
 * Optional API: BASE_URL=http://localhost:3441/api/v1 SHOP_TOKEN=... SHOP_ID=... WH_ID=... node scripts/test-shop-warehouse-catalog.js
 */
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

const isShopEffectivelyEmpty = (shopRow) => {
  if (!shopRow) return true;
  const available = Number(shopRow.quantity_available ?? 0);
  const inTransit = Number(shopRow.quantity_in_transit ?? 0);
  return available + inTransit <= 0;
};

const variantMatchesMode = (mode, ctx) => {
  const { warehouseAvailable, shopRow, level, belowMin } = ctx;
  if (warehouseAvailable <= 0) return false;
  switch (mode) {
    case 'new':
      return isShopEffectivelyEmpty(shopRow);
    case 'existing':
      return !!level || (shopRow && !isShopEffectivelyEmpty(shopRow)) || belowMin;
    case 'all':
      return true;
    default:
      return false;
  }
};

function testModeFilters() {
  const whStock = { warehouseAvailable: 10 };

  if (!variantMatchesMode('new', { ...whStock, shopRow: null })) {
    fail('new mode empty shop', 'expected match');
    return;
  }
  ok('new mode — no shop row');

  if (
    variantMatchesMode('new', {
      ...whStock,
      shopRow: { quantity_available: 5, quantity_in_transit: 0 },
    })
  ) {
    fail('new mode with shop stock', 'should not match');
    return;
  }
  ok('new mode — shop has stock excluded');

  if (
    !variantMatchesMode('existing', {
      ...whStock,
      shopRow: { quantity_available: 2, quantity_in_transit: 0 },
      level: null,
      belowMin: false,
    })
  ) {
    fail('existing with shop stock', 'expected match');
    return;
  }
  ok('existing mode — shop has stock');

  if (
    !variantMatchesMode('existing', {
      ...whStock,
      shopRow: null,
      level: { min_level: 10 },
      belowMin: true,
    })
  ) {
    fail('existing with level below min', 'expected match');
    return;
  }
  ok('existing mode — active level / below min');

  if (variantMatchesMode('all', { ...whStock, shopRow: null })) {
    ok('all mode includes any WH stock');
  } else {
    fail('all mode', 'expected match');
  }

  if (variantMatchesMode('new', { warehouseAvailable: 0, shopRow: null })) {
    fail('zero WH stock', 'should not match any mode needing stock');
  } else {
    ok('zero warehouse stock excluded');
  }
}

async function testCatalogApi() {
  const base = process.env.BASE_URL;
  const token = process.env.SHOP_TOKEN;
  const shopId = process.env.SHOP_ID;
  const whId = process.env.WH_ID;

  if (!base || !token || !shopId || !whId) {
    console.log('SKIP: API smoke (set BASE_URL, SHOP_TOKEN, SHOP_ID, WH_ID to run)');
    return;
  }

  for (const mode of ['new', 'existing', 'all']) {
    const url = `${base}/shops/${shopId}/warehouse-stock-catalog?warehouse_id=${whId}&mode=${mode}&limit=5`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      fail(`GET catalog mode=${mode}`, body.message || res.status);
      continue;
    }
    const products = body.data?.products || [];
    ok(`GET catalog mode=${mode} (${products.length} products)`);
    for (const p of products) {
      for (const v of p.variants || []) {
        if (v.warehouse_available <= 0) {
          fail(`variant ${v.variant_id}`, 'warehouse_available must be > 0');
        }
      }
    }
  }
}

async function main() {
  testModeFilters();
  await testCatalogApi();
  console.log(`\nDone: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
