const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const {
  cacheDel,
  cacheDelByPattern,
  productDetailCacheKey,
  productListCachePattern,
} = require('../../utils/cache.utils');
const { createStockLedgerEntry } = require('../stock/stockLedger.helpers');

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

const assertMappedProduct = async (productId, warehouseId) => {
  if (!productId) return;
  const product = await prisma.product.findUnique({
    where: { product_id: productId },
    select: { product_id: true, is_active: true, warehouse_id: true },
  });
  if (!product) throw new AppError('Mapped product not found', 404, 'PRODUCT_NOT_FOUND');
  if (!product.is_active) throw new AppError('Mapped product is inactive', 409, 'PRODUCT_INACTIVE');
  if (warehouseId && product.warehouse_id !== warehouseId) {
    throw new AppError('Mapped product belongs to a different warehouse', 409, 'PRODUCT_WAREHOUSE_MISMATCH');
  }
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

const invalidateProductCaches = async (productId, warehouseId) => {
  await Promise.all([
    cacheDel(productDetailCacheKey(productId)),
    cacheDelByPattern(productListCachePattern(warehouseId)),
  ]);
};

/** Resolve which variant receives stock when an inward line maps to a product. */
const resolveVariantForInwardItem = async (tx, item) => {
  const productId = item.mapped_product_id;
  if (!productId) {
    throw new AppError('Inward item has no mapped product', 400, 'INWARD_ITEM_NOT_MAPPED');
  }

  const variantText = item.variant_text ? String(item.variant_text).trim() : '';
  if (variantText) {
    const matched = await tx.productVariant.findFirst({
      where: {
        product_id: productId,
        is_active: true,
        OR: [
          { product_code: { equals: variantText, mode: 'insensitive' } },
          { sku: { equals: variantText, mode: 'insensitive' } },
          { system_barcode: { equals: variantText, mode: 'insensitive' } },
        ],
      },
      select: { variant_id: true, product_id: true, low_stock_threshold: true },
    });
    if (matched) return matched;
  }

  const defaultVariant = await tx.productVariant.findFirst({
    where: { product_id: productId, is_active: true, is_default: true },
    orderBy: { sort_order: 'asc' },
    select: { variant_id: true, product_id: true, low_stock_threshold: true },
  });
  if (defaultVariant) return defaultVariant;

  const firstVariant = await tx.productVariant.findFirst({
    where: { product_id: productId, is_active: true },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    select: { variant_id: true, product_id: true, low_stock_threshold: true },
  });

  if (!firstVariant) {
    throw new AppError('Mapped product has no active variant for stock', 409, 'MAPPED_PRODUCT_NO_VARIANT');
  }

  return firstVariant;
};

const applyStockFromMappedInward = async (tx, inwardId, warehouseId, actorUserId, purchaseEntryId = null) => {
  const inward = await tx.inwardReceipt.findUnique({
    where: { inward_id: inwardId },
    select: { inward_number: true },
  });

  const mappedItems = await tx.inwardReceiptItem.findMany({
    where: { inward_id: inwardId, mapped_product_id: { not: null } },
    select: {
      mapped_product_id: true,
      item_name: true,
      variant_text: true,
      quantity_received: true,
      batch_number: true,
      expiry_date: true,
      room_zone: true,
      rack_shelf: true,
      position: true,
    },
  });

  const touchedProducts = new Set();

  for (const item of mappedItems) {
    const variant = await resolveVariantForInwardItem(tx, item);
    const batchNumber = item.batch_number ? String(item.batch_number).trim() : '';
    const roomZone = item.room_zone?.trim() || 'DEFAULT';
    const rackShelf = item.rack_shelf?.trim() || 'DEFAULT';

    await tx.productStock.upsert({
      where: {
        variant_id_warehouse_id_batch_number: {
          variant_id: variant.variant_id,
          warehouse_id: warehouseId,
          batch_number: batchNumber,
        },
      },
      update: {
        quantity: { increment: item.quantity_received },
        room_zone: roomZone,
        rack_shelf: rackShelf,
        ...(item.position !== undefined && item.position !== null ? { position: item.position } : {}),
        ...(item.expiry_date ? { expiry_date: item.expiry_date } : {}),
        ...(purchaseEntryId && { last_purchase_id: purchaseEntryId }),
        last_purchase_date: new Date(),
      },
      create: {
        variant_id: variant.variant_id,
        product_id: variant.product_id,
        warehouse_id: warehouseId,
        quantity: item.quantity_received,
        room_zone: roomZone,
        rack_shelf: rackShelf,
        position: item.position ?? null,
        batch_number: batchNumber,
        expiry_date: item.expiry_date ?? null,
        low_stock_threshold: variant.low_stock_threshold,
        ...(purchaseEntryId && { last_purchase_id: purchaseEntryId }),
        last_purchase_date: new Date(),
      },
    });

    await createStockLedgerEntry(tx, {
      productId: variant.product_id,
      variantId: variant.variant_id,
      movementType: 'PURCHASE',
      quantity: item.quantity_received,
      toWarehouseId: warehouseId,
      referenceId: purchaseEntryId || inwardId,
      referenceType: purchaseEntryId ? 'PURCHASE_ENTRY' : 'INWARD_RECEIPT',
      batchNumber: batchNumber || null,
      expiryDate: item.expiry_date ?? null,
      createdBy: actorUserId,
      remarks: `Inward: ${inward?.inward_number || inwardId} - ${item.item_name}`,
    });

    touchedProducts.add(`${variant.product_id}:${warehouseId}`);
  }

  return touchedProducts;
};

const resolveInwardWarehouseId = (data, user) => {
  if (user?.role === 'SUPER_ADMIN') {
    if (!data.warehouse_id) {
      throw new AppError('warehouse_id is required', 400, 'WAREHOUSE_ID_REQUIRED');
    }
    return data.warehouse_id;
  }

  if (!user?.warehouseId) {
    throw new AppError('User is not assigned to a warehouse', 403, 'WAREHOUSE_NOT_ASSIGNED');
  }

  if (data.warehouse_id && data.warehouse_id !== user.warehouseId) {
    throw new AppError('Cannot create inward for another warehouse', 403, 'WAREHOUSE_FORBIDDEN');
  }

  return user.warehouseId;
};

const InwardService = {
  async createInward(data, createdByUserId, user) {
    const warehouseId = resolveInwardWarehouseId(data, user);
    const inwardData = { ...data, warehouse_id: warehouseId };

    await assertVendorWarehouseActive(inwardData.vendor_id, warehouseId);

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

    const payload = sanitizeInwardCreate(inwardData);

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

  async listInwards(query = {}, user) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = buildInwardWhere(query);

    if (user && user.role !== 'SUPER_ADMIN') {
      if (!user.warehouseId) {
        throw new AppError('User is not assigned to a warehouse', 403, 'WAREHOUSE_NOT_ASSIGNED');
      }
      where.warehouse_id = user.warehouseId;
    } else if (user?.role === 'SUPER_ADMIN' && query.warehouse_id) {
      where.warehouse_id = query.warehouse_id;
    }

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

  async getInwardById(inwardId, user) {
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
              select: {
                product_id: true,
                product_code: true,
                name: true,
                variants: {
                  where: { is_default: true },
                  take: 1,
                  select: { variant_id: true, system_barcode: true, sku: true },
                },
              },
            },
          },
        },
      },
    });
    if (!inward) throw new AppError('Inward receipt not found', 404, 'INWARD_NOT_FOUND');

    if (user && user.role !== 'SUPER_ADMIN') {
      if (!user.warehouseId || inward.warehouse_id !== user.warehouseId) {
        throw new AppError('Inward receipt not found', 404, 'INWARD_NOT_FOUND');
      }
    }

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

    const inwardWarehouse = await prisma.inwardReceipt.findUnique({
      where: { inward_id: inwardId },
      select: { warehouse_id: true },
    });
    await assertMappedProduct(data.mapped_product_id, inwardWarehouse?.warehouse_id);

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

  async addBulkInwardItems(inwardId, data, user) {
    const inward = await prisma.inwardReceipt.findUnique({
      where: { inward_id: inwardId },
      select: { inward_id: true, status: true },
    });
    if (!inward) throw new AppError('Inward receipt not found', 404);
    if (!MUTABLE_STATUSES.has(inward.status)) {
      throw new AppError('Items can only be added for ARRIVED inwards', 409);
    }
  
    const items = data.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('items array is required', 400);
    }
  
    // ✅ Limit bulk items (industry standard: 50)
    const MAX_BULK_ITEMS = 50;
    if (items.length > MAX_BULK_ITEMS) {
      throw new AppError(`Maximum ${MAX_BULK_ITEMS} items per bulk request`, 400);
    }
  
    const results = { created: [], failed: [] };
  
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        // ✅ Validate required fields (same as single item)
        if (!item.item_name) throw new Error('item_name is required');
        if (!item.quantity_received || item.quantity_received < 1) {
          throw new Error('quantity_received must be >= 1');
        }
  
        // ✅ Reuse existing addInwardItem logic
        const created = await this.addInwardItem(inwardId, item);
        results.created.push(created);
      } catch (error) {
        results.failed.push({
          index: i,
          item_name: item.item_name || `Item ${i + 1}`,
          message: error.message,
        });
      }
    }
  
    return results;
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
      const inwardWarehouse = await prisma.inwardReceipt.findUnique({
        where: { inward_id: inwardId },
        select: { warehouse_id: true },
      });
      await assertMappedProduct(data.mapped_product_id, inwardWarehouse?.warehouse_id);
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
      select: {
        inward_id: true,
        inward_number: true,      // ⭐ ADDED
        vendor_id: true,          // ⭐ ADDED
        vendor_invoice_no: true,  // ⭐ ADDED
        status: true,
        warehouse_id: true,
        items: { select: { inward_item_id: true }, take: 1 },
      },
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
  
    const previousStatus = inward.status;
    const shouldApplyStock = status === 'MAPPED' && previousStatus !== 'MAPPED';
  
    const data = {
      status,
      ...(remarks !== undefined ? { remarks } : {}),
      ...(status === 'ARRIVED' ? { arrived_at: new Date(), received_by_user_id: actorUserId } : {}),
    };
  
    const updated = await prisma.$transaction(async (tx) => {
      const receipt = await tx.inwardReceipt.update({
        where: { inward_id: inwardId },
        data,
        select: INWARD_SELECT,
      });
  
      if (shouldApplyStock) {
        // Get all mapped items to calculate total
        const mappedItemsForPurchase = await tx.inwardReceiptItem.findMany({
          where: { inward_id: inwardId, mapped_product_id: { not: null } },
          select: { purchase_cost: true, quantity_received: true }
        });
        
        let subtotal = 0;
        for (const item of mappedItemsForPurchase) {
          subtotal += (item.purchase_cost || 0) * item.quantity_received;
        }
        
        // Create Purchase Entry (header)
        const purchaseEntry = await tx.purchaseEntry.create({
          data: {
            purchase_number: `PO-${inward.inward_number}`,
            vendor_id: inward.vendor_id,
            warehouse_id: inward.warehouse_id,
            vendor_invoice_no: inward.vendor_invoice_no || null,
            purchase_date: new Date(),
            status: 'RECEIVED',
            subtotal: subtotal,
            tax_amount: 0,
            total_amount: subtotal,
            received_by: actorUserId,
            received_at: new Date(),
            remarks: `Created from inward: ${inward.inward_number}`,
          },
          select: { purchase_id: true }
        });
        
        // ⭐⭐⭐ NEW CODE — Create Purchase Items (line items) ⭐⭐⭐
        const mappedItemsForPurchaseItems = await tx.inwardReceiptItem.findMany({
          where: { inward_id: inwardId, mapped_product_id: { not: null } },
          select: {
            mapped_product_id: true,
            quantity_received: true,
            purchase_cost: true,
            batch_number: true,
            expiry_date: true,
            room_zone: true,
            rack_shelf: true,
            position: true,
            remarks: true,
          },
        });
        
        for (const item of mappedItemsForPurchaseItems) {
          await tx.purchaseItem.create({
            data: {
              purchase_id: purchaseEntry.purchase_id,
              product_id: item.mapped_product_id,
              quantity: item.quantity_received,
              purchase_cost: item.purchase_cost || 0,
              batch_number: item.batch_number || null,
              expiry_date: item.expiry_date || null,
              room_zone: item.room_zone || 'DEFAULT',
              rack_shelf: item.rack_shelf || 'DEFAULT',
              position: item.position || null,
              remarks: item.remarks || null,
            },
          });
        }
        
        // Apply stock with purchase entry ID
        await applyStockFromMappedInward(tx, inwardId, inward.warehouse_id, actorUserId, purchaseEntry.purchase_id);
      }
  
      return receipt;
    });
  
    if (shouldApplyStock) {
      const mappedItems = await prisma.inwardReceiptItem.findMany({
        where: { inward_id: inwardId, mapped_product_id: { not: null } },
        select: { mapped_product_id: true },
      });
      await Promise.all(
        [...new Set(mappedItems.map((i) => i.mapped_product_id))].map((productId) =>
          invalidateProductCaches(productId, inward.warehouse_id)
        )
      );
    }
  
    return updated;
  },
};

module.exports = InwardService;
