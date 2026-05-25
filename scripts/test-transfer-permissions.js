/**
 * Permission matrix smoke tests (no DB).
 * Run: node scripts/test-transfer-permissions.js
 */
const { AppError } = require('../src/errors/AppError');
const {
  assertCreateRequestAllowed,
  validateRolePermissions,
} = require('../src/utils/transferRequest.utils');

let passed = 0;
let failed = 0;

const expectThrow = async (label, fn, code = 'FORBIDDEN') => {
  try {
    await fn();
    console.error(`FAIL: ${label} — expected ${code}`);
    failed += 1;
  } catch (e) {
    if (e instanceof AppError && e.code === code) {
      console.log(`OK: ${label}`);
      passed += 1;
    } else {
      console.error(`FAIL: ${label} — got ${e.code || e.message}`);
      failed += 1;
    }
  }
};

const expectPass = async (label, fn) => {
  try {
    await fn();
    console.log(`OK: ${label}`);
    passed += 1;
  } catch (e) {
    console.error(`FAIL: ${label} — ${e.message}`);
    failed += 1;
  }
};

const whManager = { role: 'WH_MANAGER', userId: 'u1', warehouseId: 'wh_src' };
const shopOwnerDest = { role: 'SHOP_OWNER', userId: 'u2', shopId: 'shop_dest' };
const shopOwnerSrc = { role: 'SHOP_OWNER', userId: 'u3', shopId: 'shop_src' };
const whLister = { role: 'WH_STOCK_LISTER', userId: 'u4', warehouseId: 'wh_src' };

const run = async () => {
  console.log('--- Create permissions ---');

  expectThrow('WH_MANAGER cannot create WH_TO_SHOP', () => {
    assertCreateRequestAllowed('WH_TO_SHOP', whManager);
  });

  expectThrow('WH_STOCK_LISTER cannot create WH_TO_SHOP', () => {
    assertCreateRequestAllowed('WH_TO_SHOP', whLister);
  });

  expectPass('SHOP_OWNER can initiate WH_TO_SHOP (type)', () => {
    assertCreateRequestAllowed('WH_TO_SHOP', shopOwnerDest);
  });

  expectPass('WH_MANAGER can initiate WH_TO_WH (type)', () => {
    assertCreateRequestAllowed('WH_TO_WH', whManager);
  });

  expectThrow('SHOP_OWNER cannot create WH_TO_WH', () => {
    assertCreateRequestAllowed('WH_TO_WH', shopOwnerDest);
  });

  await expectThrow('WH_MANAGER create_dest WH_TO_SHOP blocked', () =>
    validateRolePermissions('create_dest', null, whManager, {
      requestType: 'WH_TO_SHOP',
      fromWarehouseId: 'wh_src',
      toShopId: 'shop_dest',
    })
  );

  await expectPass('SHOP_OWNER create_dest WH_TO_SHOP for own shop', () =>
    validateRolePermissions('create_dest', null, { ...shopOwnerDest, shopId: 'shop_dest' }, {
      requestType: 'WH_TO_SHOP',
      fromWarehouseId: 'wh_src',
      toShopId: 'shop_dest',
    })
  );

  console.log('--- Approve WH_TO_SHOP ---');

  const whToShopRequest = {
    request_type: 'WH_TO_SHOP',
    from_warehouse_id: 'wh_src',
    to_shop_id: 'shop_dest',
  };

  await expectPass('WH_MANAGER (source) can approve WH_TO_SHOP', () =>
    validateRolePermissions('approve', whToShopRequest, whManager)
  );

  await expectThrow('SHOP_OWNER (dest) cannot approve WH_TO_SHOP', () =>
    validateRolePermissions('approve', whToShopRequest, shopOwnerDest)
  );

  console.log('--- Dispatch ---');

  await expectPass('WH_MANAGER can dispatch WH_TO_SHOP', () =>
    validateRolePermissions('dispatch', whToShopRequest, whManager)
  );

  await expectPass('WH_STOCK_LISTER can dispatch WH_TO_SHOP', () =>
    validateRolePermissions('dispatch', whToShopRequest, whLister)
  );

  const shopToShopRequest = {
    request_type: 'SHOP_TO_SHOP',
    from_shop_id: 'shop_src',
    to_shop_id: 'shop_dest',
  };

  await expectPass('SHOP_OWNER (source) can dispatch Shop→Shop', () =>
    validateRolePermissions('dispatch', shopToShopRequest, shopOwnerSrc)
  );

  await expectThrow('WH_MANAGER cannot dispatch Shop→Shop', () =>
    validateRolePermissions('dispatch', shopToShopRequest, whManager)
  );

  console.log('--- Receive WH_TO_SHOP ---');

  await expectPass('SHOP_OWNER (dest) can receive WH_TO_SHOP', () =>
    validateRolePermissions('receive', whToShopRequest, shopOwnerDest)
  );

  await expectThrow('WH_MANAGER cannot receive WH_TO_SHOP', () =>
    validateRolePermissions('receive', whToShopRequest, whManager)
  );

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
};

run();
