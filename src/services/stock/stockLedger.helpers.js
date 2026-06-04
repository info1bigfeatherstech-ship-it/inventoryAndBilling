const { AppError } = require('../../errors/AppError');
const logger = require('../../utils/logger.utils');

const LEDGER_SELECT = {
  ledger_id: true,
  product_id: true,
  variant_id: true,
  movement_type: true,
  quantity: true,
  from_warehouse_id: true,
  to_warehouse_id: true,
  from_shop_id: true,
  to_shop_id: true,
  reference_id: true,
  reference_type: true,
  batch_number: true,
  expiry_date: true,
  unit_cost: true,
  line_value: true,
  created_by: true,
  remarks: true,
  created_at: true,
};

/**
 * Create an immutable stock ledger row inside an open Prisma transaction.
 */
const createStockLedgerEntry = async (tx, payload) => {
  const {
    productId,
    variantId = null,
    movementType,
    quantity,
    fromWarehouseId = null,
    toWarehouseId = null,
    fromShopId = null,
    toShopId = null,
    referenceId = null,
    referenceType = null,
    batchNumber = null,
    expiryDate = null,
    unitCost = null,
    lineValue = null,
    createdBy,
    remarks = null,
  } = payload;

  if (!productId) throw new AppError('Ledger product_id is required', 500, 'LEDGER_INTERNAL_ERROR');
  if (!movementType) throw new AppError('Ledger movement_type is required', 500, 'LEDGER_INTERNAL_ERROR');
  if (!createdBy) throw new AppError('Ledger created_by is required', 500, 'LEDGER_INTERNAL_ERROR');

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new AppError('Ledger quantity must be a positive integer', 400, 'TRANSFER_QUANTITY_INVALID');
  }

  const row = await tx.stockLedger.create({
    data: {
      product_id: productId,
      variant_id: variantId,
      movement_type: movementType,
      quantity: qty,
      from_warehouse_id: fromWarehouseId,
      to_warehouse_id: toWarehouseId,
      from_shop_id: fromShopId,
      to_shop_id: toShopId,
      reference_id: referenceId,
      reference_type: referenceType,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      unit_cost: unitCost != null ? Number(unitCost) : null,
      line_value: lineValue != null ? Number(lineValue) : null,
      created_by: createdBy,
      remarks,
    },
    select: LEDGER_SELECT,
  });

  logger.debug('Stock ledger entry created', {
    ledger_id: row.ledger_id,
    movement_type: row.movement_type,
    quantity: row.quantity,
    variant_id: row.variant_id,
  });

  return row;
};

module.exports = {
  LEDGER_SELECT,
  createStockLedgerEntry,
};
