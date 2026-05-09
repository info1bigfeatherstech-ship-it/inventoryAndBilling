const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');

const MUTABLE_STATUSES = new Set(['ARRIVED']);

const INWARD_SELECT = {
  inward_id: true,
  inward_number: true,
  vendor_id: true,
  warehouse_id: true,
  status: true,
  expected_date: true,
  arrived_at: true,
  vendor_invoice_no: true,
  challan_no: true,
  transport_details: true,
  created_by_user_id: true,
  received_by_user_id: true,
  remarks: true,
  created_at: true,
  updated_at: true,
};

const ITEM_SELECT = {
  inward_item_id: true,
  inward_id: true,
  line_no: true,
  item_name: true,
  variant_text: true,
  quantity_received: true,
  purchase_cost: true,
  batch_number: true,
  expiry_date: true,
  room_zone: true,
  rack_shelf: true,
  position: true,
  mapped_product_id: true,
  remarks: true,
  created_at: true,
  updated_at: true,
};

const buildInwardWhere = (query = {}) => {
  const where = {};
  if (query.vendor_id) where.vendor_id = query.vendor_id;
  if (query.warehouse_id) where.warehouse_id = query.warehouse_id;
  if (query.status) where.status = query.status;

  if (query.expected_from || query.expected_to) {
    where.expected_date = {
      ...(query.expected_from ? { gte: query.expected_from } : {}),
      ...(query.expected_to ? { lte: query.expected_to } : {}),
    };
  }

  if (query.search) {
    const s = String(query.search).trim();
    where.OR = [
      { inward_number: { contains: s, mode: 'insensitive' } },
      { vendor_invoice_no: { contains: s, mode: 'insensitive' } },
      { challan_no: { contains: s, mode: 'insensitive' } },
      { vendor: { company_name: { contains: s, mode: 'insensitive' } } },
    ];
  }

  return where;
};

const nextLineNo = async (tx, inwardId) => {
  const row = await tx.inwardReceiptItem.aggregate({
    where: { inward_id: inwardId },
    _max: { line_no: true },
  });
  return (row._max.line_no || 0) + 1;
};

const generateInwardNumber = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `INW-${y}${m}${d}-${suffix}`;
};

const assertVendorWarehouseActive = async (vendorId, warehouseId) => {
  const [vendor, warehouse] = await Promise.all([
    prisma.vendor.findUnique({ where: { vendor_id: vendorId }, select: { vendor_id: true, is_active: true } }),
    prisma.warehouse.findUnique({ where: { warehouse_id: warehouseId }, select: { warehouse_id: true, is_active: true } }),
  ]);

  if (!vendor) throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
  if (!vendor.is_active) throw new AppError('Vendor is inactive', 409, 'VENDOR_INACTIVE');
  if (!warehouse) throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  if (!warehouse.is_active) throw new AppError('Warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');
};

const assertMappedProduct = async (productId) => {
  if (!productId) return;
  const product = await prisma.product.findUnique({
    where: { product_id: productId },
    select: { product_id: true, is_active: true },
  });
  if (!product) throw new AppError('Mapped product not found', 404, 'PRODUCT_NOT_FOUND');
  if (!product.is_active) throw new AppError('Mapped product is inactive', 409, 'PRODUCT_INACTIVE');
};

const sanitizeInwardCreate = (data) => ({
  vendor_id: data.vendor_id,
  warehouse_id: data.warehouse_id,
  expected_date: data.expected_date ?? null,
  remarks: data.remarks ?? null,
});

const sanitizeItemPayload = (data) => ({
  item_name: data.item_name,
  variant_text: data.variant_text ?? null,
  quantity_received: data.quantity_received,
  purchase_cost: data.purchase_cost ?? null,
  batch_number: data.batch_number ?? null,
  expiry_date: data.expiry_date ?? null,
  room_zone: data.room_zone ?? null,
  rack_shelf: data.rack_shelf ?? null,
  position: data.position ?? null,
  mapped_product_id: data.mapped_product_id ?? null,
  remarks: data.remarks ?? null,
});

const InwardService = {
  async createInward(data, createdByUserId) {
    await assertVendorWarehouseActive(data.vendor_id, data.warehouse_id);

    if (data.transport_details || data.vendor_invoice_no || data.challan_no) {
      throw new AppError(
        'Transport/challan/invoice details are allowed only after goods arrival',
        400,
        'ARRIVAL_DETAILS_NOT_ALLOWED_ON_SCHEDULE'
      );
    }

    if (Array.isArray(data.items) && data.items.length) {
      throw new AppError(
        'Items cannot be added at schedule creation. Add items after marking ARRIVED.',
        400,
        'ITEMS_NOT_ALLOWED_ON_SCHEDULE'
      );
    }

    const payload = sanitizeInwardCreate(data);

    return prisma.$transaction(async (tx) => {
      let inward = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          inward = await tx.inwardReceipt.create({
            data: {
              ...payload,
              created_by_user_id: createdByUserId,
              inward_number: generateInwardNumber(),
            },
            select: INWARD_SELECT,
          });
          break;
        } catch (error) {
          if (error.code === 'P2002' && attempt < 2) continue;
          throw error;
        }
      }

      if (!inward) throw new AppError('Failed to create inward receipt', 500, 'INWARD_CREATE_FAILED');

      return tx.inwardReceipt.findUnique({
        where: { inward_id: inward.inward_id },
        select: {
          ...INWARD_SELECT,
          vendor: { select: { vendor_id: true, company_name: true } },
          warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true } },
          items: { orderBy: { line_no: 'asc' }, select: ITEM_SELECT },
        },
      });
    });
  },

  async updateArrivalDetails(inwardId, actorUserId, data) {
    const inward = await prisma.inwardReceipt.findUnique({
      where: { inward_id: inwardId },
      select: { inward_id: true, status: true, arrived_at: true },
    });
    if (!inward) throw new AppError('Inward receipt not found', 404, 'INWARD_NOT_FOUND');
    if (inward.status === 'CANCELLED') {
      throw new AppError('Cancelled inward cannot be updated', 409, 'INWARD_ALREADY_CANCELLED');
    }
    if (inward.status === 'MAPPED') {
      throw new AppError('Mapped inward cannot be moved back to arrival stage', 409, 'INWARD_ALREADY_MAPPED');
    }

    return prisma.inwardReceipt.update({
      where: { inward_id: inwardId },
      data: {
        status: 'ARRIVED',
        arrived_at: inward.status === 'ARRIVED' ? inward.arrived_at : new Date(),
        received_by_user_id: actorUserId,
        ...(Object.prototype.hasOwnProperty.call(data, 'vendor_invoice_no') ? { vendor_invoice_no: data.vendor_invoice_no ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'challan_no') ? { challan_no: data.challan_no ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'transport_details') ? { transport_details: data.transport_details ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'remarks') ? { remarks: data.remarks ?? null } : {}),
      },
      select: INWARD_SELECT,
    });
  },

  async listInwards(query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = buildInwardWhere(query);

    const [total, inwards] = await Promise.all([
      prisma.inwardReceipt.count({ where }),
      prisma.inwardReceipt.findMany({
        where,
        skip,
        take,
        orderBy: [{ expected_date: 'asc' }, { created_at: 'desc' }],
        select: {
          ...INWARD_SELECT,
          vendor: { select: { vendor_id: true, company_name: true } },
          warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return { total, page, limit, inwards };
  },

  async getInwardById(inwardId) {
    const inward = await prisma.inwardReceipt.findUnique({
      where: { inward_id: inwardId },
      select: {
        ...INWARD_SELECT,
        vendor: { select: { vendor_id: true, company_name: true, phone: true } },
        warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true } },
        created_by: { select: { user_id: true, name: true, role: true } },
        received_by: { select: { user_id: true, name: true, role: true } },
        items: {
          orderBy: { line_no: 'asc' },
          select: {
            ...ITEM_SELECT,
            mapped_product: {
              select: { product_id: true, product_code: true, name: true, system_barcode: true },
            },
          },
        },
      },
    });
    if (!inward) throw new AppError('Inward receipt not found', 404, 'INWARD_NOT_FOUND');
    return inward;
  },

  async addInwardItem(inwardId, data) {
    const inward = await prisma.inwardReceipt.findUnique({
      where: { inward_id: inwardId },
      select: { inward_id: true, status: true },
    });
    if (!inward) throw new AppError('Inward receipt not found', 404, 'INWARD_NOT_FOUND');
    if (!MUTABLE_STATUSES.has(inward.status)) {
      throw new AppError('Items can only be edited for scheduled/arrived inwards', 409, 'INWARD_NOT_MUTABLE');
    }

    await assertMappedProduct(data.mapped_product_id);

    return prisma.$transaction(async (tx) => {
      const lineNo = await nextLineNo(tx, inwardId);
      return tx.inwardReceiptItem.create({
        data: {
          inward_id: inwardId,
          line_no: lineNo,
          ...sanitizeItemPayload(data),
        },
        select: ITEM_SELECT,
      });
    });
  },

  async updateInwardItem(inwardId, inwardItemId, data) {
    const inward = await prisma.inwardReceipt.findUnique({
      where: { inward_id: inwardId },
      select: { inward_id: true, status: true },
    });
    if (!inward) throw new AppError('Inward receipt not found', 404, 'INWARD_NOT_FOUND');
    if (!MUTABLE_STATUSES.has(inward.status)) {
      throw new AppError('Items can only be edited for scheduled/arrived inwards', 409, 'INWARD_NOT_MUTABLE');
    }

    const existing = await prisma.inwardReceiptItem.findUnique({
      where: { inward_item_id: inwardItemId },
      select: { inward_item_id: true, inward_id: true },
    });
    if (!existing || existing.inward_id !== inwardId) {
      throw new AppError('Inward item not found', 404, 'INWARD_ITEM_NOT_FOUND');
    }

    if (Object.prototype.hasOwnProperty.call(data, 'mapped_product_id')) {
      await assertMappedProduct(data.mapped_product_id);
    }

    const allowed = [
      'item_name',
      'variant_text',
      'quantity_received',
      'purchase_cost',
      'batch_number',
      'expiry_date',
      'room_zone',
      'rack_shelf',
      'position',
      'mapped_product_id',
      'remarks',
    ];
    const payload = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(data, key)) payload[key] = data[key];
    }
    if (!Object.keys(payload).length) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    return prisma.inwardReceiptItem.update({
      where: { inward_item_id: inwardItemId },
      data: payload,
      select: ITEM_SELECT,
    });
  },

  async removeInwardItem(inwardId, inwardItemId) {
    const inward = await prisma.inwardReceipt.findUnique({
      where: { inward_id: inwardId },
      select: { inward_id: true, status: true },
    });
    if (!inward) throw new AppError('Inward receipt not found', 404, 'INWARD_NOT_FOUND');
    if (!MUTABLE_STATUSES.has(inward.status)) {
      throw new AppError('Items can only be edited for scheduled/arrived inwards', 409, 'INWARD_NOT_MUTABLE');
    }

    const existing = await prisma.inwardReceiptItem.findUnique({
      where: { inward_item_id: inwardItemId },
      select: { inward_item_id: true, inward_id: true },
    });
    if (!existing || existing.inward_id !== inwardId) {
      throw new AppError('Inward item not found', 404, 'INWARD_ITEM_NOT_FOUND');
    }

    await prisma.inwardReceiptItem.delete({ where: { inward_item_id: inwardItemId } });
  },

  async updateInwardStatus(inwardId, status, actorUserId, remarks) {
    const inward = await prisma.inwardReceipt.findUnique({
      where: { inward_id: inwardId },
      select: { inward_id: true, status: true, items: { select: { inward_item_id: true }, take: 1 } },
    });
    if (!inward) throw new AppError('Inward receipt not found', 404, 'INWARD_NOT_FOUND');
    if (inward.status === 'CANCELLED') {
      throw new AppError('Cancelled inward cannot be updated', 409, 'INWARD_ALREADY_CANCELLED');
    }

    if (status === 'ARRIVED') {
      throw new AppError('Use arrival-details endpoint to mark ARRIVED', 400, 'USE_ARRIVAL_DETAILS_ENDPOINT');
    }

    if (status === 'MAPPED' && inward.status !== 'ARRIVED') {
      throw new AppError('Only ARRIVED inward can move to MAPPED', 409, 'INWARD_NOT_ARRIVED');
    }

    if (status === 'MAPPED') {
      const unmapped = await prisma.inwardReceiptItem.count({
        where: { inward_id: inwardId, mapped_product_id: null },
      });
      if (unmapped > 0) {
        throw new AppError('All inward items must be mapped before status MAPPED', 409, 'INWARD_ITEMS_UNMAPPED', { unmappedItems: unmapped });
      }
    }

    const data = {
      status,
      ...(remarks !== undefined ? { remarks } : {}),
      ...(status === 'ARRIVED' ? { arrived_at: new Date(), received_by_user_id: actorUserId } : {}),
    };

    return prisma.inwardReceipt.update({
      where: { inward_id: inwardId },
      data,
      select: INWARD_SELECT,
    });
  },
};

module.exports = InwardService;
