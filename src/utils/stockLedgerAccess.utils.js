// backend/src/utils/stockLedgerAccess.utils.js
const { AppError } = require('../middlewares/error.middleware');

const applyLedgerScope = (where, user) => {
  // SUPER_ADMIN sees everything
  if (user?.role === 'SUPER_ADMIN') return where;
  
  // Shop roles: only see their shop's ledger
  if (['SHOP_OWNER', 'SHOP_STOCK_LISTER', 'BILLING_STAFF'].includes(user?.role)) {
    if (!user.shopId) {
      throw new AppError('User not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
    }
    
    // ✅ Return new object with AND condition
    return {
      AND: [
        where,
        {
          OR: [
            { from_shop_id: user.shopId },
            { to_shop_id: user.shopId }
          ]
        }
      ]
    };
  }
  
  // Warehouse roles: only see their warehouse's ledger
  if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user?.role)) {
    if (!user.warehouseId) {
      throw new AppError('User not assigned to a warehouse', 403, 'WAREHOUSE_NOT_ASSIGNED');
    }
    
    // ✅ Return new object with AND condition
    return {
      AND: [
        where,
        {
          OR: [
            { from_warehouse_id: user.warehouseId },
            { to_warehouse_id: user.warehouseId }
          ]
        }
      ]
    };
  }
  
  return where;
};

const assertLedgerReadAccess = (ledgerEntry, user) => {
  if (user?.role === 'SUPER_ADMIN') return;
  
  // Shop roles
  if (['SHOP_OWNER', 'SHOP_STOCK_LISTER', 'BILLING_STAFF'].includes(user?.role)) {
    if (!user.shopId) {
      throw new AppError('User not assigned to a shop', 403, 'SHOP_NOT_ASSIGNED');
    }
    if (ledgerEntry.from_shop_id !== user.shopId && ledgerEntry.to_shop_id !== user.shopId) {
      throw new AppError('Access denied to this ledger entry', 403, 'FORBIDDEN');
    }
    return;
  }
  
  // Warehouse roles
  if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user?.role)) {
    if (!user.warehouseId) {
      throw new AppError('User not assigned to a warehouse', 403, 'WAREHOUSE_NOT_ASSIGNED');
    }
    if (ledgerEntry.from_warehouse_id !== user.warehouseId && ledgerEntry.to_warehouse_id !== user.warehouseId) {
      throw new AppError('Access denied to this ledger entry', 403, 'FORBIDDEN');
    }
  }
};

module.exports = {
  applyLedgerScope,
  assertLedgerReadAccess,
};