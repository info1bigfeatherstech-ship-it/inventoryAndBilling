/**
 * Localhost smoke test for internal online stock APIs.
 *
 * Prerequisites:
 *   - Backend running (default http://localhost:3000)
 *   - INTERNAL_STOCK_API_KEY set in backend .env (same value here or via env)
 *   - Settings → Online Stock warehouse configured
 *   - Migrations applied
 *
 * Usage:
 *   node scripts/smoke-online-stock.js
 *   SMOKE_PRODUCT_CODE=34354-1 SMOKE_FULL=1 node scripts/smoke-online-stock.js
 *   SMOKE_PRODUCT_CODE=34354-1 SMOKE_FULL=1 SMOKE_COMMIT=1 node scripts/smoke-online-stock.js
 *
 * Windows PowerShell:
 *   $env:SMOKE_PRODUCT_CODE="34354-1"; $env:SMOKE_FULL="1"; npm run smoke:online-stock
 */
require('dotenv').config();

const BASE =
  String(process.env.SMOKE_BASE_URL || process.env.INVENTORY_STOCK_BASE_URL || 'http://localhost:3000/api/v1/internal/stock').replace(
    /\/$/,
    ''
  );
const API_KEY = String(process.env.INTERNAL_STOCK_API_KEY || process.env.INVENTORY_STOCK_API_KEY || '').trim();
const PRODUCT_CODE = String(process.env.SMOKE_PRODUCT_CODE || '').trim();
const FULL = String(process.env.SMOKE_FULL || '').trim() === '1';
const DO_COMMIT = String(process.env.SMOKE_COMMIT || '').trim() === '1';

const fail = (msg, extra) => {
  console.error('FAIL:', msg);
  if (extra) console.error(extra);
  process.exit(1);
};

const ok = (msg) => console.log('OK:', msg);

async function call(path, body) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  console.log('--- Online stock smoke ---');
  console.log('BASE:', BASE);

  if (!API_KEY) {
    fail('Set INTERNAL_STOCK_API_KEY (or INVENTORY_STOCK_API_KEY) in env / backend .env');
  }

  // 1) Auth / config probe via batch with empty-safe single probe code
  const probeCodes = PRODUCT_CODE ? [PRODUCT_CODE, '___SMOKE_MISSING_CODE___'] : ['___SMOKE_MISSING_CODE___'];
  const batch = await call('/batch', { codes: probeCodes });

  if (batch.status === 503 && batch.json?.code === 'INTERNAL_STOCK_API_DISABLED') {
    fail('INTERNAL_STOCK_API_KEY not configured on server', batch.json);
  }
  if (batch.status === 401) {
    fail('Invalid API key — must match backend INTERNAL_STOCK_API_KEY', batch.json);
  }
  if (batch.status === 409 && batch.json?.code === 'ONLINE_WAREHOUSE_NOT_CONFIGURED') {
    fail('Configure Settings → Online Stock warehouse first', batch.json);
  }
  if (batch.status !== 200 || !batch.json?.success) {
    fail(`batch unexpected status ${batch.status}`, batch.json);
  }

  ok(`batch warehouse_id=${batch.json.data.warehouse_id}`);
  ok(`missing includes probe: ${JSON.stringify(batch.json.data.missing)}`);

  if (PRODUCT_CODE) {
    const row = batch.json.data.stock?.[PRODUCT_CODE];
    if (!row) {
      console.warn(`WARN: ${PRODUCT_CODE} not in stock map (missing or not in WH). Full cycle skipped.`);
    } else {
      ok(`${PRODUCT_CODE} available=${row.available}`);
    }
  } else {
    console.log('TIP: set SMOKE_PRODUCT_CODE=<in-stock-code> and SMOKE_FULL=1 for reserve/release cycle');
  }

  if (!FULL || !PRODUCT_CODE) {
    ok('smoke (batch-only) passed');
    process.exit(0);
  }

  const available = batch.json.data.stock?.[PRODUCT_CODE]?.available;
  if (available == null || available < 1) {
    fail(`Need available >= 1 for ${PRODUCT_CODE} to run full cycle`, batch.json.data.stock);
  }

  const orderId = `SMOKE-${Date.now()}`;

  const reserve = await call('/reserve', {
    orderId,
    storefront: 'ecomm',
    lines: [{ productCode: PRODUCT_CODE, quantity: 1 }],
  });
  if (reserve.status !== 201 && reserve.status !== 200) {
    fail(`reserve failed ${reserve.status}`, reserve.json);
  }
  ok(`reserve ${orderId} status=${reserve.json?.data?.reservation?.status}`);

  const reserveAgain = await call('/reserve', {
    orderId,
    storefront: 'ecomm',
    lines: [{ productCode: PRODUCT_CODE, quantity: 1 }],
  });
  if (!reserveAgain.json?.data?.idempotent) {
    fail('expected idempotent reserve replay', reserveAgain.json);
  }
  ok('reserve idempotent replay');

  const release = await call('/release', { orderId });
  if (release.status !== 200) {
    fail(`release failed ${release.status}`, release.json);
  }
  ok(`release ${orderId}`);

  const releaseAgain = await call('/release', { orderId });
  if (!releaseAgain.json?.data?.idempotent) {
    fail('expected idempotent release replay', releaseAgain.json);
  }
  ok('release idempotent replay');

  if (!DO_COMMIT) {
    ok('smoke (full reserve/release) passed — set SMOKE_COMMIT=1 to also test commit (reduces WH qty by 1)');
    process.exit(0);
  }

  // Optional: reserve + commit (permanently reduces warehouse quantity by 1)
  const orderId2 = `SMOKE-COMMIT-${Date.now()}`;
  const reserve2 = await call('/reserve', {
    orderId: orderId2,
    storefront: 'ecomm',
    lines: [{ productCode: PRODUCT_CODE, quantity: 1 }],
  });
  if (reserve2.status !== 201 && reserve2.status !== 200) {
    fail(`reserve2 failed ${reserve2.status}`, reserve2.json);
  }

  const commit = await call('/commit', { orderId: orderId2 });
  if (commit.status !== 200) {
    fail(`commit failed ${commit.status}`, commit.json);
  }
  ok(`commit ${orderId2}`);

  const commitAgain = await call('/commit', { orderId: orderId2 });
  if (!commitAgain.json?.data?.idempotent) {
    fail('expected idempotent commit replay', commitAgain.json);
  }
  ok('commit idempotent replay');

  console.warn(
    `NOTE: commit permanently reduced WH qty by 1 for ${PRODUCT_CODE}. Adjust stock in UI if needed.`
  );

  ok('smoke (full + commit) passed');
  process.exit(0);
}

main().catch((err) => fail(err.message || String(err)));
