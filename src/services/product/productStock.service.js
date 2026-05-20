const { parse } = require('csv-parse/sync');
const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const { resolveWarehouseId, applyWarehouseScope } = require('../../utils/productAccess.utils');
const { cacheDel, cacheDelByPattern, productDetailCacheKey, productListCachePattern } = require('../../utils/cache.utils');

const STOCK_SELECT = {
  stock_id: true,
  variant_id: true,
  product_id: true,
  warehouse_id: true,
  quantity: true,
  low_stock_threshold: true,
  room_zone: true,
  rack_shelf: true,
  position: true,
  batch_number: true,
  expiry_date: true,
  last_purchase_id: true,
  last_purchase_date: true,
  remarks: true,
  created_at: true,
  updated_at: true,
  variant: {
    select: {
      variant_id: true,
      sku: true,
      system_barcode: true,
      product: { select: { product_id: true, product_code: true, name: true, warehouse_id: true } },
    },
  },
  warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true } },
};

const sanitizeStockPayload = (data) => ({
  quantity: data.quantity != null ? Number(data.quantity) : undefined,
  low_stock_threshold: data.low_stock_threshold != null ? Number(data.low_stock_threshold) : undefined,
  room_zone: data.room_zone != null ? String(data.room_zone).trim() : undefined,
  rack_shelf: data.rack_shelf != null ? String(data.rack_shelf).trim() : undefined,
  position: data.position !== undefined ? data.position : undefined,
  batch_number: data.batch_number !== undefined ? String(data.batch_number || '').trim() : undefined,
  expiry_date: data.expiry_date !== undefined ? data.expiry_date : undefined,
  remarks: data.remarks !== undefined ? data.remarks : undefined,
});

const assertVariantInWarehouse = async (variantId, warehouseId) => {
  const variant = await prisma.productVariant.findUnique({
    where: { variant_id: variantId },
    select: {
      variant_id: true,
      product_id: true,
      product: { select: { warehouse_id: true, is_active: true } },
    },
  });

  if (!variant || !variant.product.is_active) {
    throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
  }

  if (variant.product.warehouse_id !== warehouseId) {
    throw new AppError('Variant does not belong to this warehouse', 409, 'VARIANT_WAREHOUSE_MISMATCH');
  }

  return variant;
};

const invalidateProductCacheByStock = async (productId, warehouseId) => {
  await Promise.all([
    cacheDel(productDetailCacheKey(productId)),
    cacheDelByPattern(productListCachePattern(warehouseId)),
  ]);
};

const buildStockWhere = (query, user) => {
  const where = {};
  if (query.variant_id) where.variant_id = query.variant_id;
  if (query.product_id) where.product_id = query.product_id;
  if (query.batch_number !== undefined) where.batch_number = String(query.batch_number || '').trim();

  if (query.search) {
    const s = String(query.search).trim();
    where.OR = [
      { room_zone: { contains: s, mode: 'insensitive' } },
      { rack_shelf: { contains: s, mode: 'insensitive' } },
      { batch_number: { contains: s, mode: 'insensitive' } },
      { variant: { sku: { contains: s, mode: 'insensitive' } } },
      { variant: { system_barcode: { contains: s, mode: 'insensitive' } } },
      { variant: { product: { name: { contains: s, mode: 'insensitive' } } } },
    ];
  }

  applyWarehouseScope(where, user);
  return where;
};

const ProductStockService = {
  async createStock(data, user) {
    const warehouseId = resolveWarehouseId(user, data.warehouse_id);
    const variantId = data.variant_id;

    if (!variantId) throw new AppError('variant_id is required', 400, 'VARIANT_ID_REQUIRED');

    const variant = await assertVariantInWarehouse(variantId, warehouseId);
    const payload = sanitizeStockPayload(data);

    if (payload.quantity === undefined || payload.quantity < 0) {
      throw new AppError('quantity is required and must be >= 0', 400, 'INVALID_QUANTITY');
    }
    if (!payload.room_zone) throw new AppError('room_zone is required', 400, 'ROOM_ZONE_REQUIRED');
    if (!payload.rack_shelf) throw new AppError('rack_shelf is required', 400, 'RACK_SHELF_REQUIRED');

    const batchNumber = payload.batch_number !== undefined ? payload.batch_number : '';

    const stock = await prisma.productStock.create({
      data: {
        variant_id: variantId,
        product_id: variant.product_id,
        warehouse_id: warehouseId,
        quantity: payload.quantity,
        room_zone: payload.room_zone,
        rack_shelf: payload.rack_shelf,
        position: payload.position ?? null,
        batch_number: batchNumber,
        expiry_date: payload.expiry_date ?? null,
        low_stock_threshold: payload.low_stock_threshold ?? null,
        remarks: payload.remarks ?? null,
      },
      select: STOCK_SELECT,
    });

    await invalidateProductCacheByStock(variant.product_id, warehouseId);
    return stock;
  },

  async listStocks(query = {}, user) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = buildStockWhere(query, user);

    const [total, stocks] = await Promise.all([
      prisma.productStock.count({ where }),
      prisma.productStock.findMany({
        where,
        skip,
        take,
        orderBy: [{ updated_at: 'desc' }],
        select: STOCK_SELECT,
      }),
    ]);

    return { total, page, limit, stocks };
  },

  async getStockById(stockId, user) {
    const stock = await prisma.productStock.findUnique({ where: { stock_id: stockId }, select: STOCK_SELECT });
    if (!stock) throw new AppError('Stock record not found', 404, 'STOCK_NOT_FOUND');

    if (user.role !== 'SUPER_ADMIN' && user.warehouseId && stock.warehouse_id !== user.warehouseId) {
      throw new AppError('Stock record not found', 404, 'STOCK_NOT_FOUND');
    }

    return stock;
  },

  async updateStock(stockId, data, user) {
    const existing = await prisma.productStock.findUnique({
      where: { stock_id: stockId },
      select: { stock_id: true, warehouse_id: true, product_id: true, variant_id: true },
    });
    if (!existing) throw new AppError('Stock record not found', 404, 'STOCK_NOT_FOUND');

    if (user.role !== 'SUPER_ADMIN' && user.warehouseId && existing.warehouse_id !== user.warehouseId) {
      throw new AppError('Stock record not found', 404, 'STOCK_NOT_FOUND');
    }

    const payload = sanitizeStockPayload(data);
    if (payload.quantity !== undefined && payload.quantity < 0) {
      throw new AppError('quantity cannot be negative', 400, 'INVALID_QUANTITY');
    }

    const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
    if (!Object.keys(cleaned).length) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    const stock = await prisma.productStock.update({
      where: { stock_id: stockId },
      data: cleaned,
      select: STOCK_SELECT,
    });

    await invalidateProductCacheByStock(existing.product_id, existing.warehouse_id);
    return stock;
  },

  async deleteStock(stockId, user) {
    const existing = await prisma.productStock.findUnique({
      where: { stock_id: stockId },
      select: { stock_id: true, warehouse_id: true, product_id: true, quantity: true },
    });
    if (!existing) throw new AppError('Stock record not found', 404, 'STOCK_NOT_FOUND');

    if (user.role !== 'SUPER_ADMIN' && user.warehouseId && existing.warehouse_id !== user.warehouseId) {
      throw new AppError('Stock record not found', 404, 'STOCK_NOT_FOUND');
    }

    await prisma.productStock.delete({ where: { stock_id: stockId } });
    await invalidateProductCacheByStock(existing.product_id, existing.warehouse_id);
    return { stock_id: stockId };
  },

  async bulkCreateFromCsv(fileBuffer, user, { warehouseId: requestedWarehouseId } = {}) {
    const warehouseId = resolveWarehouseId(user, requestedWarehouseId || user.forcedWarehouseId);

    const records = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    if (!records.length) throw new AppError('CSV file is empty', 400, 'CSV_EMPTY');

    const results = { created: 0, failed: [] };

    for (let i = 0; i < records.length; i += 1) {
      const row = records[i];
      try {
        let variantId = row.variant_id;
        if (!variantId && row.system_barcode) {
          const variant = await prisma.productVariant.findFirst({
            where: {
              system_barcode: String(row.system_barcode).trim().toUpperCase(),
              product: { warehouse_id: warehouseId },
            },
            select: { variant_id: true },
          });
          if (!variant) throw new AppError('Variant not found for system_barcode', 404, 'VARIANT_NOT_FOUND');
          variantId = variant.variant_id;
        }

        await this.createStock(
          {
            warehouse_id: warehouseId,
            variant_id: variantId,
            quantity: row.quantity,
            room_zone: row.room_zone,
            rack_shelf: row.rack_shelf,
            position: row.position || null,
            batch_number: row.batch_number || '',
            expiry_date: row.expiry_date || null,
            low_stock_threshold: row.low_stock_threshold || null,
            remarks: row.remarks || null,
          },
          user
        );
        results.created += 1;
      } catch (error) {
        results.failed.push({ row: i + 2, message: error.message, code: error.code || 'ROW_FAILED' });
      }
    }

    return results;
  },

  async bulkUpdate(items, user) {
    if (!Array.isArray(items) || !items.length) {
      throw new AppError('items array is required', 400, 'ITEMS_REQUIRED');
    }

    const results = { updated: 0, failed: [] };
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        if (!item.stock_id) throw new AppError('stock_id is required', 400, 'STOCK_ID_REQUIRED');
        await this.updateStock(item.stock_id, item, user);
        results.updated += 1;
      } catch (error) {
        results.failed.push({ index: i, stock_id: item.stock_id, message: error.message, code: error.code || 'UPDATE_FAILED' });
      }
    }
    return results;
  },

  async bulkDelete(stockIds, user) {
    if (!Array.isArray(stockIds) || !stockIds.length) {
      throw new AppError('stock_ids array is required', 400, 'STOCK_IDS_REQUIRED');
    }

    const results = { deleted: 0, failed: [] };
    for (const stockId of stockIds) {
      try {
        await this.deleteStock(stockId, user);
        results.deleted += 1;
      } catch (error) {
        results.failed.push({ stock_id: stockId, message: error.message, code: error.code || 'DELETE_FAILED' });
      }
    }
    return results;
  },
};

module.exports = ProductStockService;
