const { AppError } = require('../../errors/AppError');
const { createStockLedgerEntry } = require('./stockLedger.helpers');

const normalizeBatch = (value) => (value != null ? String(value).trim() : '');

const deductWarehouseStock = async (tx, variantId, warehouseId, quantity, batchNumber) => {
  let row = null;
  let usedBatch = batchNumber;

  // If no batch number specified, find any stock with sufficient quantity
  if (!batchNumber || batchNumber === '') {
    row = await tx.productStock.findFirst({
      where: {
        variant_id: variantId,
        warehouse_id: warehouseId,
        quantity: { gte: quantity },
      },
      orderBy: { expiry_date: 'asc' }, // FIFO - oldest expiry first
    });
    
    if (row) {
      usedBatch = row.batch_number;
    }
  } else {
    // Exact batch match
    row = await tx.productStock.findUnique({
      where: {
        variant_id_warehouse_id_batch_number: {
          variant_id: variantId,
          warehouse_id: warehouseId,
          batch_number: batchNumber,
        },
      },
    });
  }

  if (!row) {
    throw new AppError(
      `Insufficient warehouse stock. Requested: ${quantity}`,
      409,
      'INSUFFICIENT_STOCK',
      { requested: quantity, batch_number: batchNumber || 'any batch' }
    );
  }

  const available = row.quantity;
  if (available < quantity) {
    throw new AppError(
      `Insufficient warehouse stock. Available: ${available}, requested: ${quantity}`,
      409,
      'INSUFFICIENT_STOCK',
      { available, requested: quantity, batch_number: row.batch_number || 'default' }
    );
  }

  await tx.productStock.update({
    where: { stock_id: row.stock_id },
    data: { quantity: { decrement: quantity } },
  });
  
  return row;
};

const addWarehouseStock = async (tx, variant, warehouseId, quantity, batchNumber) => {
  return tx.productStock.upsert({
    where: {
      variant_id_warehouse_id_batch_number: {
        variant_id: variant.variant_id,
        warehouse_id: warehouseId,
        batch_number: batchNumber,
      },
    },
    update: { quantity: { increment: quantity } },
    create: {
      variant_id: variant.variant_id,
      product_id: variant.product_id,
      warehouse_id: warehouseId,
      quantity,
      room_zone: 'DEFAULT',
      rack_shelf: 'DEFAULT',
      batch_number: batchNumber,
      low_stock_threshold: variant.low_stock_threshold,
    },
  });
};

const incrementShopInTransit = async (tx, shopId, variantId, quantity, lowStockThreshold) => {
  return tx.shopStock.upsert({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    update: { quantity_in_transit: { increment: quantity } },
    create: {
      shop_id: shopId,
      variant_id: variantId,
      quantity_in_transit: quantity,
      low_stock_threshold: lowStockThreshold ?? 5,
    },
  });
};

const decrementShopInTransit = async (tx, shopId, variantId, quantity) => {
  const row = await tx.shopStock.findUnique({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
  });
  const inTransit = row?.quantity_in_transit ?? 0;
  if (inTransit < quantity) {
    throw new AppError(
      `Insufficient in-transit stock. In transit: ${inTransit}, requested: ${quantity}`,
      409,
      'INSUFFICIENT_IN_TRANSIT',
      { in_transit: inTransit, requested: quantity }
    );
  }
  await tx.shopStock.update({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    data: { quantity_in_transit: { decrement: quantity } },
  });
};

const incrementShopAvailable = async (tx, shopId, variantId, quantity, lowStockThreshold) => {
  return tx.shopStock.upsert({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    update: { quantity_available: { increment: quantity } },
    create: {
      shop_id: shopId,
      variant_id: variantId,
      quantity_available: quantity,
      low_stock_threshold: lowStockThreshold ?? 5,
    },
  });
};

const decrementShopAvailable = async (tx, shopId, variantId, quantity) => {
  const row = await tx.shopStock.findUnique({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
  });
  const available = row?.quantity_available ?? 0;
  if (available < quantity) {
    throw new AppError(
      `Insufficient shop stock. Available: ${available}, requested: ${quantity}`,
      409,
      'INSUFFICIENT_STOCK',
      { available, requested: quantity }
    );
  }
  await tx.shopStock.update({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
    data: { quantity_available: { decrement: quantity } },
  });
};

/**
 * Dispatch stock for WH→Shop bulk/single line.
 */
const dispatchWhToShop = async (tx, params) => {
  const {
    variant,
    fromWarehouseId,
    toShopId,
    quantity,
    batchNumber,
    referenceId,
    referenceType,
    createdBy,
    remarks,
  } = params;

  await deductWarehouseStock(tx, variant.variant_id, fromWarehouseId, quantity, batchNumber);
  await incrementShopInTransit(tx, toShopId, variant.variant_id, quantity, variant.low_stock_threshold);

  return createStockLedgerEntry(tx, {
    productId: variant.product_id,
    variantId: variant.variant_id,
    movementType: 'WH_TO_SHOP',
    quantity,
    fromWarehouseId,
    toShopId,
    referenceId,
    referenceType,
    batchNumber: batchNumber || null,
    createdBy,
    remarks,
  });
};

/**
 * Receive stock for WH→Shop line.
 */
const receiveWhToShop = async (tx, params) => {
  const {
    variant,
    toShopId,
    quantity,
    batchNumber,
    referenceId,
    referenceType,
    createdBy,
    remarks,
  } = params;

  await decrementShopInTransit(tx, toShopId, variant.variant_id, quantity);
  await incrementShopAvailable(tx, toShopId, variant.variant_id, quantity, variant.low_stock_threshold);

  return createStockLedgerEntry(tx, {
    productId: variant.product_id,
    variantId: variant.variant_id,
    movementType: 'WH_TO_SHOP',
    quantity,
    toShopId,
    referenceId,
    referenceType,
    batchNumber: batchNumber || null,
    createdBy,
    remarks,
  });
};

/**
 * Cancel/reverse WH→Shop in-transit quantity.
 */
const reverseWhToShopDispatch = async (tx, params) => {
  const { variant, fromWarehouseId, toShopId, quantity, batchNumber } = params;
  await addWarehouseStock(tx, variant, fromWarehouseId, quantity, batchNumber);
  await decrementShopInTransit(tx, toShopId, variant.variant_id, quantity);
};

const validateWarehouseStock = async (tx, variantId, warehouseId, quantity, batchNumber) => {
  const row = await tx.productStock.findUnique({
    where: {
      variant_id_warehouse_id_batch_number: {
        variant_id: variantId,
        warehouse_id: warehouseId,
        batch_number: batchNumber,
      },
    },
  });
  const available = row?.quantity ?? 0;
  if (available < quantity) {
    throw new AppError(
      `Insufficient warehouse stock. Available: ${available}, requested: ${quantity}`,
      409,
      'INSUFFICIENT_STOCK',
      { available, requested: quantity }
    );
  }
};

module.exports = {
  normalizeBatch,
  deductWarehouseStock,
  addWarehouseStock,
  incrementShopInTransit,
  decrementShopInTransit,
  incrementShopAvailable,
  decrementShopAvailable,
  dispatchWhToShop,
  receiveWhToShop,
  reverseWhToShopDispatch,
  validateWarehouseStock,
};
