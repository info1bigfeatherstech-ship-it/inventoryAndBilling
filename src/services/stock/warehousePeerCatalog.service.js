const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { assertWarehouseAssigned, isSuperAdmin, isWarehouseStaff } = require('../../utils/warehouseAccess.utils');
const { getWarehouseStockAvailable } = require('../../utils/warehouseStock.utils');
const { parsePagination } = require('../../utils/pagination.utils');
const logger = require('../../utils/logger.utils');

const CATALOG_MODES = ['new', 'existing', 'all'];

const isDestEffectivelyEmpty = (destQty) => destQty <= 0;

const variantMatchesMode = (mode, ctx) => {
  const { sourceAvailable, destQty } = ctx;
  if (sourceAvailable <= 0) return false;
  switch (mode) {
    case 'new':
      return isDestEffectivelyEmpty(destQty);
    case 'existing':
      return !isDestEffectivelyEmpty(destQty);
    case 'all':
      return true;
    default:
      return false;
  }
};

const assertDestWarehouseAccess = (destWarehouseId, user) => {
  if (isSuperAdmin(user)) return;
  if (!isWarehouseStaff(user)) {
    throw new AppError('Only warehouse staff can use peer stock catalog', 403, 'FORBIDDEN');
  }
  assertWarehouseAssigned(user);
  if (user.warehouseId !== destWarehouseId) {
    throw new AppError('You can only request stock for your assigned warehouse', 403, 'WAREHOUSE_FORBIDDEN');
  }
};

const WarehousePeerCatalogService = {
  /**
   * Catalog for WH→WH bulk: stock at peer (from) warehouse, visibility vs destination warehouse.
   */
  async getPeerStockCatalog(destWarehouseId, query, user) {
    const resolvedDestId = String(destWarehouseId || '').trim();
    assertDestWarehouseAccess(resolvedDestId, user);

    const fromWarehouseId = String(query.from_warehouse_id || '').trim();
    if (!fromWarehouseId) {
      throw new AppError('from_warehouse_id query parameter is required', 400, 'FROM_WAREHOUSE_ID_REQUIRED');
    }
    if (fromWarehouseId === resolvedDestId) {
      throw new AppError('Source and destination warehouse must differ', 400, 'SAME_WAREHOUSE');
    }

    const mode = String(query.mode || 'all').trim().toLowerCase();
    if (!CATALOG_MODES.includes(mode)) {
      throw new AppError(`mode must be one of: ${CATALOG_MODES.join(', ')}`, 400, 'INVALID_CATALOG_MODE');
    }

    const [fromWh, destWh] = await Promise.all([
      prisma.warehouse.findUnique({
        where: { warehouse_id: fromWarehouseId },
        select: { warehouse_id: true, warehouse_name: true, warehouse_code: true, city: true, is_active: true },
      }),
      prisma.warehouse.findUnique({
        where: { warehouse_id: resolvedDestId },
        select: { warehouse_id: true, warehouse_name: true, is_active: true },
      }),
    ]);
    if (!fromWh?.is_active) throw new AppError('Source warehouse not found or inactive', 404, 'WAREHOUSE_NOT_FOUND');
    if (!destWh?.is_active) throw new AppError('Destination warehouse not found or inactive', 404, 'WAREHOUSE_NOT_FOUND');

    const search = query.search ? String(query.search).trim().toLowerCase() : '';

    const sourceStockRows = await prisma.productStock.groupBy({
      by: ['variant_id'],
      where: { warehouse_id: fromWarehouseId, quantity: { gt: 0 } },
      _sum: { quantity: true },
    });

    if (!sourceStockRows.length) {
      return {
        destination_warehouse_id: resolvedDestId,
        from_warehouse_id: fromWarehouseId,
        from_warehouse_name: fromWh.warehouse_name,
        mode,
        products: [],
        meta: { total_products: 0, total_variants: 0 },
      };
    }

    const variantIds = sourceStockRows.map((r) => r.variant_id);
    const sourceQtyMap = new Map(sourceStockRows.map((r) => [r.variant_id, r._sum.quantity ?? 0]));

    const [variants, destStocks] = await Promise.all([
      prisma.productVariant.findMany({
        where: {
          variant_id: { in: variantIds },
          is_active: true,
          product: { is_active: true, warehouse_id: fromWarehouseId },
        },
        select: {
          variant_id: true,
          product_id: true,
          product_code: true,
          sku: true,
          product: {
            select: { product_id: true, product_code: true, name: true, brand_name: true },
          },
        },
        orderBy: [{ product: { name: 'asc' } }, { sort_order: 'asc' }],
      }),
      prisma.productStock.groupBy({
        by: ['variant_id'],
        where: { warehouse_id: resolvedDestId, variant_id: { in: variantIds } },
        _sum: { quantity: true },
      }),
    ]);

    const destQtyMap = new Map(destStocks.map((r) => [r.variant_id, r._sum.quantity ?? 0]));
    const productMap = new Map();

    for (const variant of variants) {
      const sourceAvailable = sourceQtyMap.get(variant.variant_id) ?? 0;
      const destQty = destQtyMap.get(variant.variant_id) ?? 0;

      if (!variantMatchesMode(mode, { sourceAvailable, destQty })) continue;

      if (search) {
        const haystack = [variant.product.name, variant.product.product_code, variant.product_code, variant.sku]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) continue;
      }

      const variantPayload = {
        variant_id: variant.variant_id,
        product_code: variant.product_code,
        sku: variant.sku,
        warehouse_available: sourceAvailable,
        dest_available: destQty,
        suggested_quantity: mode === 'existing' && destQty > 0 ? Math.max(1, Math.min(sourceAvailable, 10)) : null,
        selectable: sourceAvailable > 0,
      };

      const productId = variant.product_id;
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          product_id: variant.product.product_id,
          product_code: variant.product.product_code,
          name: variant.product.name,
          brand_name: variant.product.brand_name,
          variants: [],
        });
      }
      productMap.get(productId).variants.push(variantPayload);
    }

    let products = Array.from(productMap.values()).filter((p) => p.variants.length > 0);
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const totalProducts = products.length;
    const totalVariants = products.reduce((s, p) => s + p.variants.length, 0);
    products = products.slice(skip, skip + take);

    logger.info('Warehouse peer stock catalog', {
      dest_warehouse_id: resolvedDestId,
      from_warehouse_id: fromWarehouseId,
      mode,
      products: products.length,
      user_id: user.userId,
    });

    return {
      destination_warehouse_id: resolvedDestId,
      from_warehouse_id: fromWarehouseId,
      from_warehouse_name: fromWh.warehouse_name,
      from_warehouse_code: fromWh.warehouse_code,
      mode,
      products,
      meta: {
        page,
        limit,
        total_products: totalProducts,
        total_variants: totalVariants,
        total_pages: Math.ceil(totalProducts / limit) || 0,
      },
    };
  },
};

module.exports = WarehousePeerCatalogService;
