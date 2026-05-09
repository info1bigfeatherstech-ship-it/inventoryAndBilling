const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');

const WAREHOUSE_SELECT = {
  warehouse_id: true,
  warehouse_code: true,
  warehouse_name: true,
  address: true,
  city: true,
  manager_name: true,
  is_active: true,
  remarks: true,
  created_at: true,
  updated_at: true,
};

const buildWarehouseWhere = (filters = {}) => {
  const where = {};

  if (typeof filters.is_active === 'boolean') {
    where.is_active = filters.is_active;
  }

  if (filters.city) {
    where.city = { contains: String(filters.city).trim(), mode: 'insensitive' };
  }

  if (filters.search) {
    const search = String(filters.search).trim();
    where.OR = [
      { warehouse_code: { contains: search, mode: 'insensitive' } },
      { warehouse_name: { contains: search, mode: 'insensitive' } },
      { manager_name: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
};

const sanitizeWarehouseCreate = (data) => ({
  warehouse_code: data.warehouse_code,
  warehouse_name: data.warehouse_name,
  address: data.address,
  city: data.city,
  manager_name: data.manager_name ?? null,
  remarks: data.remarks ?? null,
});

const sanitizeWarehouseUpdate = (data) => {
  const allowed = ['warehouse_code', 'warehouse_name', 'address', 'city', 'manager_name', 'is_active', 'remarks'];
  const payload = {};

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      payload[key] = data[key];
    }
  }

  return payload;
};

const assertDeactivationAllowed = async (warehouseId) => {
  const [activeUsers, activeStockRows] = await Promise.all([
    prisma.user.count({
      where: {
        warehouse_id: warehouseId,
        is_active: true,
      },
    }),
    prisma.productStock.count({
      where: {
        warehouse_id: warehouseId,
        quantity: { gt: 0 },
      },
    }),
  ]);

  if (activeUsers > 0) {
    throw new AppError(
      'Cannot deactivate warehouse with active assigned users',
      409,
      'WAREHOUSE_HAS_ACTIVE_USERS',
      { activeUsers }
    );
  }

  if (activeStockRows > 0) {
    throw new AppError(
      'Cannot deactivate warehouse with positive stock',
      409,
      'WAREHOUSE_HAS_ACTIVE_STOCK',
      { stockRows: activeStockRows }
    );
  }
};

const WarehouseService = {
  async createWarehouse(data) {
    const payload = sanitizeWarehouseCreate(data);
    const warehouse = await prisma.warehouse.create({
      data: payload,
      select: WAREHOUSE_SELECT,
    });
    return warehouse;
  },

  async listWarehouses(query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = buildWarehouseWhere(query);

    const [total, warehouses] = await Promise.all([
      prisma.warehouse.count({ where }),
      prisma.warehouse.findMany({
        where,
        skip,
        take,
        orderBy: [{ is_active: 'desc' }, { created_at: 'desc' }],
        select: {
          ...WAREHOUSE_SELECT,
          _count: {
            select: {
              users: true,
              product_stocks: true,
              purchase_entries: true,
            },
          },
        },
      }),
    ]);

    return { total, page, limit, warehouses };
  },

  async getWarehouseById(warehouseId) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { warehouse_id: warehouseId },
      select: {
        ...WAREHOUSE_SELECT,
        _count: {
          select: {
            users: true,
            product_stocks: true,
            purchase_entries: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
    }

    return warehouse;
  },

  async updateWarehouse(warehouseId, data) {
    const payload = sanitizeWarehouseUpdate(data);
    if (Object.keys(payload).length === 0) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    const exists = await prisma.warehouse.findUnique({
      where: { warehouse_id: warehouseId },
      select: { warehouse_id: true, is_active: true },
    });
    if (!exists) {
      throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
    }

    if (payload.is_active === false && exists.is_active) {
      await assertDeactivationAllowed(warehouseId);
    }

    const warehouse = await prisma.warehouse.update({
      where: { warehouse_id: warehouseId },
      data: payload,
      select: WAREHOUSE_SELECT,
    });

    return warehouse;
  },

  async softDeleteWarehouse(warehouseId) {
    const exists = await prisma.warehouse.findUnique({
      where: { warehouse_id: warehouseId },
      select: { warehouse_id: true, is_active: true },
    });

    if (!exists) {
      throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
    }

    if (!exists.is_active) {
      return { alreadyInactive: true };
    }

    await assertDeactivationAllowed(warehouseId);

    await prisma.warehouse.update({
      where: { warehouse_id: warehouseId },
      data: { is_active: false },
      select: { warehouse_id: true },
    });

    return { alreadyInactive: false };
  },
};

module.exports = WarehouseService;
