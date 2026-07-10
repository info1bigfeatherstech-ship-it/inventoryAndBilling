const prisma = require('./prisma.utils');

const SHOP_LEDGER_ROLES = new Set(['SHOP_OWNER', 'SHOP_MANAGER', 'BILLING_STAFF']);
const WAREHOUSE_LEDGER_ROLES = new Set(['WH_MANAGER', 'WH_STOCK_LISTER']);

const isShopLedgerViewer = (role) => SHOP_LEDGER_ROLES.has(role);
const isWarehouseLedgerViewer = (role) => WAREHOUSE_LEDGER_ROLES.has(role);

/**
 * Shop view: prefer RECEIVE leg once goods are received; show DISPATCH only while in-transit.
 * Warehouse view: prefer DISPATCH leg once receive is recorded; hide duplicate RECEIVE rows.
 * Super admin: full audit trail (no dedupe).
 */
const applyTransferLedgerVisibilityWhere = async (where, user) => {
  if (!user || user.role === 'SUPER_ADMIN') {
    return where;
  }

  if (isShopLedgerViewer(user.role) && user.shopId) {
    const receivedLegs = await prisma.stockLedger.findMany({
      where: {
        movement_type: 'WH_TO_SHOP',
        movement_phase: 'RECEIVE',
        to_shop_id: user.shopId,
        reference_id: { not: null },
      },
      select: {
        reference_id: true,
        reference_type: true,
        variant_id: true,
      },
      distinct: ['reference_id', 'reference_type', 'variant_id'],
    });

    if (!receivedLegs.length) {
      return where;
    }

    const hideDispatchLegs = receivedLegs.map((leg) => ({
      movement_type: 'WH_TO_SHOP',
      movement_phase: 'DISPATCH',
      reference_id: leg.reference_id,
      reference_type: leg.reference_type,
      variant_id: leg.variant_id,
      to_shop_id: user.shopId,
    }));

    return {
      AND: [where, { NOT: { OR: hideDispatchLegs } }],
    };
  }

  if (isWarehouseLedgerViewer(user.role) && user.warehouseId) {
    const dispatchedLegs = await prisma.stockLedger.findMany({
      where: {
        movement_type: 'WH_TO_SHOP',
        movement_phase: 'DISPATCH',
        from_warehouse_id: user.warehouseId,
        reference_id: { not: null },
      },
      select: {
        reference_id: true,
        reference_type: true,
        variant_id: true,
      },
      distinct: ['reference_id', 'reference_type', 'variant_id'],
    });

    if (!dispatchedLegs.length) {
      return where;
    }

    const hideReceiveLegs = dispatchedLegs.map((leg) => ({
      movement_type: 'WH_TO_SHOP',
      movement_phase: 'RECEIVE',
      reference_id: leg.reference_id,
      reference_type: leg.reference_type,
      variant_id: leg.variant_id,
      from_warehouse_id: user.warehouseId,
    }));

    return {
      AND: [where, { NOT: { OR: hideReceiveLegs } }],
    };
  }

  return where;
};

module.exports = {
  isShopLedgerViewer,
  isWarehouseLedgerViewer,
  applyTransferLedgerVisibilityWhere,
};
