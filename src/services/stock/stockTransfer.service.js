const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { createStockLedgerEntry } = require('./stockLedger.helpers');
const { resolveWarehouseId } = require('../../utils/productAccess.utils');
const { assertShopReadAccess, resolveShopIdForUser } = require('../../utils/shopAccess.utils');
const {
  cacheDel,
  cacheDelByPattern,
  productDetailCacheKey,
  productListCachePattern,
} = require('../../utils/cache.utils');
const logger = require('../../utils/logger.utils');

const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 };

const invalidateProductCaches = async (productId, warehouseId) => {
  await Promise.all([
    cacheDel(productDetailCacheKey(productId)),
    cacheDelByPattern(productListCachePattern(warehouseId)),
  ]);
};

const normalizeBatch = (value) => (value != null ? String(value).trim() : '');

const assertPositiveIntQuantity = (quantity) => {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new AppError('quantity must be a positive integer', 400, 'TRANSFER_QUANTITY_INVALID');
  }
  return qty;
};

const assertWarehouseActive = async (warehouseId) => {
  const wh = await prisma.warehouse.findUnique({
    where: { warehouse_id: warehouseId },
    select: { warehouse_id: true, is_active: true },
  });
  if (!wh) throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  if (!wh.is_active) throw new AppError('Warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');
  return wh;
};

const assertShopActive = async (shopId) => {
  const shop = await prisma.shop.findUnique({
    where: { shop_id: shopId },
    select: { shop_id: true, is_active: true },
  });
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  if (!shop.is_active) throw new AppError('Shop is inactive', 409, 'SHOP_INACTIVE');
  return shop;
};

const loadVariantForTransfer = async (variantId) => {
  const variant = await prisma.productVariant.findUnique({
    where: { variant_id: variantId },
    select: {
      variant_id: true,
      product_id: true,
      is_active: true,
      low_stock_threshold: true,
      product: { select: { warehouse_id: true, is_active: true } },
    },
  });

  if (!variant || !variant.is_active || !variant.product.is_active) {
    throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
  }

  return variant;
};

const lockWarehouseStock = async (tx, variantId, warehouseId, batchNumber) => {
  return tx.productStock.findUnique({
    where: {
      variant_id_warehouse_id_batch_number: {
        variant_id: variantId,
        warehouse_id: warehouseId,
        batch_number: batchNumber,
      },
    },
  });
};

const assertWarehouseHasStock = async (tx, variantId, warehouseId, quantity, batchNumber) => {
  const row = await lockWarehouseStock(tx, variantId, warehouseId, batchNumber);
  const available = row?.quantity ?? 0;

  if (available < quantity) {
    throw new AppError(
      `Insufficient warehouse stock. Available: ${available}, requested: ${quantity}`,
      409,
      'INSUFFICIENT_STOCK',
      { available, requested: quantity, batch_number: batchNumber }
    );
  }

  return row;
};

const deductWarehouseStock = async (tx, variant, warehouseId, quantity, batchNumber) => {
  const row = await assertWarehouseHasStock(tx, variant.variant_id, warehouseId, quantity, batchNumber);

  if (row) {
    await tx.productStock.update({
      where: { stock_id: row.stock_id },
      data: { quantity: { decrement: quantity } },
    });
    return row;
  }

  throw new AppError('Warehouse stock row not found for deduction', 404, 'STOCK_NOT_FOUND');
};

const addWarehouseStock = async (tx, variant, warehouseId, quantity, batchNumber, location = {}) => {
  const roomZone = location.room_zone?.trim() || 'DEFAULT';
  const rackShelf = location.rack_shelf?.trim() || 'DEFAULT';

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
      room_zone: roomZone,
      rack_shelf: rackShelf,
      position: location.position ?? null,
      batch_number: batchNumber,
      low_stock_threshold: variant.low_stock_threshold,
      remarks: location.remarks ?? null,
    },
  });
};

const lockShopStock = async (tx, shopId, variantId) =>
  tx.shopStock.findUnique({
    where: { shop_id_variant_id: { shop_id: shopId, variant_id: variantId } },
  });

const StockTransferService = {
  async transferWarehouseToShop(data, user) {
    const fromWarehouseId = resolveWarehouseId(user, data.from_warehouse_id);
    const toShopId = data.to_shop_id;
    const variantId = data.variant_id;
    const quantity = assertPositiveIntQuantity(data.quantity);
    const batchNumber = normalizeBatch(data.batch_number);
    const remarks = data.remarks ?? null;

    if (!toShopId) throw new AppError('to_shop_id is required', 400, 'SHOP_ID_REQUIRED');

    await Promise.all([
      assertWarehouseActive(fromWarehouseId),
      assertShopActive(toShopId),
    ]);

    const variant = await loadVariantForTransfer(variantId);

    if (variant.product.warehouse_id !== fromWarehouseId) {
      throw new AppError('Variant does not belong to source warehouse', 409, 'VARIANT_WAREHOUSE_MISMATCH');
    }

    const result = await prisma.$transaction(async (tx) => {
      await deductWarehouseStock(tx, variant, fromWarehouseId, quantity, batchNumber);

      const shopRow = await tx.shopStock.upsert({
        where: { shop_id_variant_id: { shop_id: toShopId, variant_id: variantId } },
        update: { quantity_available: { increment: quantity } },
        create: {
          shop_id: toShopId,
          variant_id: variantId,
          quantity_available: quantity,
          low_stock_threshold: variant.low_stock_threshold ?? 5,
        },
      });

      const ledger = await createStockLedgerEntry(tx, {
        productId: variant.product_id,
        variantId: variant.variant_id,
        movementType: 'WH_TO_SHOP',
        quantity,
        fromWarehouseId,
        toShopId,
        referenceType: 'STOCK_TRANSFER',
        batchNumber: batchNumber || null,
        createdBy: user.userId,
        remarks,
      });

      return {
        success: true,
        transferred: quantity,
        ledger_id: ledger.ledger_id,
        source_remaining: (await lockWarehouseStock(tx, variantId, fromWarehouseId, batchNumber))?.quantity ?? 0,
        destination_new_quantity: shopRow.quantity_available,
      };
    }, TX_OPTIONS);

    await invalidateProductCaches(variant.product_id, fromWarehouseId);
    logger.info('WH→Shop transfer completed', { ...result, variant_id: variantId, user_id: user.userId });
    return result;
  },

  async transferWarehouseToWarehouse(data, user) {
    const fromWarehouseId = resolveWarehouseId(user, data.from_warehouse_id);

    if (!data.to_warehouse_id) {
      throw new AppError('to_warehouse_id is required', 400, 'WAREHOUSE_ID_REQUIRED');
    }

    const toWh = data.to_warehouse_id;

    if (fromWarehouseId === toWh) {
      throw new AppError('Source and destination warehouse must be different', 400, 'SAME_LOCATION_TRANSFER');
    }

    const variantId = data.variant_id;
    const quantity = assertPositiveIntQuantity(data.quantity);
    const batchNumber = normalizeBatch(data.batch_number);
    const remarks = data.remarks ?? null;

    await Promise.all([assertWarehouseActive(fromWarehouseId), assertWarehouseActive(toWh)]);

    const variant = await loadVariantForTransfer(variantId);

    if (variant.product.warehouse_id !== fromWarehouseId) {
      throw new AppError('Variant does not belong to source warehouse', 409, 'VARIANT_WAREHOUSE_MISMATCH');
    }

    const result = await prisma.$transaction(async (tx) => {
      await deductWarehouseStock(tx, variant, fromWarehouseId, quantity, batchNumber);

      await addWarehouseStock(tx, variant, toWh, quantity, batchNumber, {
        room_zone: data.room_zone,
        rack_shelf: data.rack_shelf,
        position: data.position,
        remarks: data.remarks,
      });

      const ledger = await createStockLedgerEntry(tx, {
        productId: variant.product_id,
        variantId: variant.variant_id,
        movementType: 'WH_TO_WH',
        quantity,
        fromWarehouseId,
        toWarehouseId: toWh,
        referenceType: 'STOCK_TRANSFER',
        batchNumber: batchNumber || null,
        createdBy: user.userId,
        remarks,
      });

      return {
        success: true,
        transferred: quantity,
        ledger_id: ledger.ledger_id,
        source_remaining: (await lockWarehouseStock(tx, variantId, fromWarehouseId, batchNumber))?.quantity ?? 0,
      };
    }, TX_OPTIONS);

    await Promise.all([
      invalidateProductCaches(variant.product_id, fromWarehouseId),
      invalidateProductCaches(variant.product_id, toWh),
    ]);

    logger.info('WH→WH transfer completed', { ...result, variant_id: variantId });
    return result;
  },

  async transferShopToShop(data, user) {
    const fromShopId = resolveShopIdForUser(user, data.from_shop_id);
    const toShopId = data.to_shop_id;
    const variantId = data.variant_id;
    const quantity = assertPositiveIntQuantity(data.quantity);
    const remarks = data.remarks ?? null;

    if (!toShopId) throw new AppError('to_shop_id is required', 400, 'SHOP_ID_REQUIRED');
    if (fromShopId === toShopId) {
      throw new AppError('Source and destination shop must be different', 400, 'SAME_LOCATION_TRANSFER');
    }

    assertShopReadAccess(fromShopId, user);
    assertShopReadAccess(toShopId, user);

    await Promise.all([assertShopActive(fromShopId), assertShopActive(toShopId)]);

    const variant = await loadVariantForTransfer(variantId);

    const result = await prisma.$transaction(async (tx) => {
      const source = await lockShopStock(tx, fromShopId, variantId);
      const available = source?.quantity_available ?? 0;

      if (available < quantity) {
        throw new AppError(
          `Insufficient shop stock. Available: ${available}, requested: ${quantity}`,
          409,
          'INSUFFICIENT_STOCK',
          { available }
        );
      }

      await tx.shopStock.update({
        where: { shop_id_variant_id: { shop_id: fromShopId, variant_id: variantId } },
        data: { quantity_available: { decrement: quantity } },
      });

      const dest = await tx.shopStock.upsert({
        where: { shop_id_variant_id: { shop_id: toShopId, variant_id: variantId } },
        update: { quantity_available: { increment: quantity } },
        create: {
          shop_id: toShopId,
          variant_id: variantId,
          quantity_available: quantity,
          low_stock_threshold: variant.low_stock_threshold ?? 5,
        },
      });

      const ledger = await createStockLedgerEntry(tx, {
        productId: variant.product_id,
        variantId: variant.variant_id,
        movementType: 'SHOP_TO_SHOP',
        quantity,
        fromShopId,
        toShopId,
        referenceType: 'STOCK_TRANSFER',
        createdBy: user.userId,
        remarks,
      });

      return {
        success: true,
        transferred: quantity,
        ledger_id: ledger.ledger_id,
        source_remaining: available - quantity,
        destination_new_quantity: dest.quantity_available,
      };
    }, TX_OPTIONS);

    logger.info('Shop→Shop transfer completed', { ...result, variant_id: variantId });
    return result;
  },

  async reconcileStock(data, user) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new AppError('Only SUPER_ADMIN can reconcile stock', 403, 'FORBIDDEN');
    }

    const variantId = data.variant_id;
    const warehouseId = data.warehouse_id;
    const physicalCount = Number(data.physical_count);
    const batchNumber = normalizeBatch(data.batch_number);
    const reason = data.reason || data.remarks || 'Physical stock reconciliation';

    if (!warehouseId) throw new AppError('warehouse_id is required', 400, 'WAREHOUSE_ID_REQUIRED');
    if (!Number.isInteger(physicalCount) || physicalCount < 0) {
      throw new AppError('physical_count must be a non-negative integer', 400, 'INVALID_QUANTITY');
    }

    await assertWarehouseActive(warehouseId);
    const variant = await loadVariantForTransfer(variantId);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await lockWarehouseStock(tx, variantId, warehouseId, batchNumber);
      const systemQty = existing?.quantity ?? 0;
      const diff = physicalCount - systemQty;

      if (diff === 0) {
        return { success: true, adjusted: 0, system_quantity: systemQty, physical_count: physicalCount };
      }

      if (diff > 0) {
        await addWarehouseStock(tx, variant, warehouseId, diff, batchNumber, {
          room_zone: existing?.room_zone,
          rack_shelf: existing?.rack_shelf,
          remarks: reason,
        });
      } else {
        const deductQty = Math.abs(diff);
        if (systemQty < deductQty) {
          throw new AppError('Cannot reconcile below zero system stock', 409, 'INSUFFICIENT_STOCK');
        }
        await tx.productStock.update({
          where: { stock_id: existing.stock_id },
          data: { quantity: physicalCount },
        });
      }

      const ledger = await createStockLedgerEntry(tx, {
        productId: variant.product_id,
        variantId: variant.variant_id,
        movementType: 'ADJUSTMENT',
        quantity: Math.abs(diff),
        ...(diff > 0 ? { toWarehouseId: warehouseId } : { fromWarehouseId: warehouseId }),
        referenceType: 'STOCK_RECONCILIATION',
        batchNumber: batchNumber || null,
        createdBy: user.userId,
        remarks: `${reason} (system ${systemQty} → physical ${physicalCount})`,
      });

      return {
        success: true,
        adjusted: diff,
        ledger_id: ledger.ledger_id,
        system_quantity_before: systemQty,
        physical_count: physicalCount,
        system_quantity_after: physicalCount,
      };
    }, TX_OPTIONS);

    await invalidateProductCaches(variant.product_id, warehouseId);
    logger.info('Stock reconciliation completed', result);
    return result;
  },
};

module.exports = StockTransferService;
