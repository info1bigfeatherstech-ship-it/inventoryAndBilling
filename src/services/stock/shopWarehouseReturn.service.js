const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { roundMoney } = require('../../utils/billing.utils');
const { parsePagination } = require('../../utils/pagination.utils');
const { resolveOwnerShopId } = require('../../utils/transferRequest.utils');
const {
  calculateFranchiseUnitPrice,
  isFranchiseShopType,
} = require('../../utils/franchisePrice.utils');
const AppSettingsService = require('../settings/appSettings.service');
const { receiveShopToWarehouse } = require('./transferStock.ops');
const {
  generateReturnNumber,
  generateReturnBillNumber,
} = require('../../utils/shopWarehouseReturn.utils');
const logger = require('../../utils/logger.utils');

const ACTIVE_RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'DISPATCHED', 'COMPLETED'];

const VARIANT_SELECT = {
  variant_id: true,
  product_id: true,
  product_code: true,
  sku: true,
  system_barcode: true,
  mrp: true,
  special_price: true,
  purchase_price: true,
  expenses: true,
  low_stock_threshold: true,
  attributes: true,
  product: {
    select: {
      name: true,
      brand_name: true,
      hsn_code: true,
      gst_percent: true,
      gst_type: true,
      warranty: true,
    },
  },
};

const RETURN_INCLUDE = {
  from_shop: {
    select: {
      shop_id: true,
      shop_code: true,
      shop_name: true,
      city: true,
      pincode: true,
      shop_type: true,
      address: true,
      phone: true,
      state_code: true,
    },
  },
  to_warehouse: {
    select: {
      warehouse_id: true,
      warehouse_code: true,
      warehouse_name: true,
      city: true,
      address: true,
      gstin: true,
      legal_name: true,
      state_code: true,
      manager_name: true,
    },
  },
  items: {
    include: { variant: { select: VARIANT_SELECT } },
    orderBy: { return_item_id: 'asc' },
  },
};

const resolveShopIdForUser = async (user, explicitShopId = null) => {
  if (user.role === 'SUPER_ADMIN') {
    if (explicitShopId) return explicitShopId;
    throw new AppError('shop_id is required', 400, 'SHOP_ID_REQUIRED');
  }
  if (user.role === 'SHOP_OWNER') {
    const shopId = await resolveOwnerShopId(user);
    if (!shopId) throw new AppError('Shop not found for user', 403, 'FORBIDDEN');
    if (explicitShopId && explicitShopId !== shopId) {
      throw new AppError('Cannot return for another shop', 403, 'FORBIDDEN');
    }
    return shopId;
  }
  if (['SHOP_MANAGER', 'BILLING_STAFF'].includes(user.role)) {
    const shopId = user.shopId || user.shop_id;
    if (!shopId) throw new AppError('Shop not assigned', 403, 'FORBIDDEN');
    if (explicitShopId && explicitShopId !== shopId) {
      throw new AppError('Cannot return for another shop', 403, 'FORBIDDEN');
    }
    return shopId;
  }
  throw new AppError('Only shop users can create stock returns', 403, 'FORBIDDEN');
};

const assertWarehouseActor = (user, warehouseId) => {
  if (user.role === 'SUPER_ADMIN') return;
  if (!['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
    throw new AppError('Warehouse role required', 403, 'FORBIDDEN');
  }
  const whId = user.warehouseId || user.warehouse_id;
  if (!whId || whId !== warehouseId) {
    throw new AppError('Not authorized for this warehouse', 403, 'FORBIDDEN');
  }
};

const assertShopActor = async (user, shopId) => {
  if (user.role === 'SUPER_ADMIN') return;
  if (!['SHOP_OWNER', 'SHOP_MANAGER'].includes(user.role)) {
    throw new AppError('Shop role required', 403, 'FORBIDDEN');
  }
  const resolved = await resolveShopIdForUser(user);
  if (resolved !== shopId) {
    throw new AppError('Not authorized for this shop', 403, 'FORBIDDEN');
  }
};

const assertCanViewReturn = async (user, row) => {
  if (user.role === 'SUPER_ADMIN') return;
  if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
    assertWarehouseActor(user, row.to_warehouse_id);
    return;
  }
  await assertShopActor(user, row.from_shop_id);
};

const committedReturnQty = (item) => {
  if (item.approved_quantity != null) return Math.max(0, Number(item.approved_quantity) || 0);
  return Math.max(0, Number(item.return_quantity) || 0);
};

/**
 * Qty already committed against a source inbound transfer line (variant).
 * Excludes REJECTED / CANCELLED. Optionally excludes one return_id (edit/self).
 */
const sumCommittedAgainstSource = async (tx, { sourceType, sourceId, variantId, excludeReturnId }) => {
  const where = {
    variant_id: variantId,
    return_request: {
      status: { in: ACTIVE_RETURN_STATUSES },
      ...(excludeReturnId ? { return_id: { not: excludeReturnId } } : {}),
      ...(sourceType === 'bulk'
        ? { source_bulk_request_id: sourceId }
        : { source_transfer_request_id: sourceId }),
    },
  };
  const rows = await tx.shopWarehouseReturnItem.findMany({
    where,
    select: { return_quantity: true, approved_quantity: true },
  });
  return rows.reduce((sum, row) => sum + committedReturnQty(row), 0);
};

const normalizeLookupCode = (value) => String(value || '').trim();

/**
 * Resolve inbound WH→Shop transfer by transfer bill number OR request number.
 * Owned shops often have no FTB bill — bulk/request number still works.
 */
const resolveSourceTransfer = async (lookupCode, shopId) => {
  const code = normalizeLookupCode(lookupCode);
  if (!code) {
    throw new AppError('Bill / invoice number is required', 400, 'BILL_NUMBER_REQUIRED');
  }

  const completedStatuses = ['COMPLETED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'DISPATCHED', 'IN_TRANSIT'];

  const bulkByBill = await prisma.bulkTransferRequest.findFirst({
    where: {
      request_type: 'WH_TO_SHOP',
      to_shop_id: shopId,
      OR: [{ transfer_bill_number: code }, { bulk_request_number: code }],
      status: { in: completedStatuses },
    },
    include: {
      from_warehouse: {
        select: {
          warehouse_id: true,
          warehouse_code: true,
          warehouse_name: true,
          city: true,
        },
      },
      to_shop: {
        select: {
          shop_id: true,
          shop_code: true,
          shop_name: true,
          shop_type: true,
          city: true,
        },
      },
      items: {
        where: { is_approved: { not: false } },
        include: { variant: { select: VARIANT_SELECT } },
      },
    },
  });

  if (bulkByBill) {
    const lines = [];
    for (const item of bulkByBill.items) {
      const received =
        Number(item.received_quantity) > 0
          ? Number(item.received_quantity)
          : Number(item.approved_quantity) > 0
            ? Number(item.approved_quantity)
            : 0;
      if (received <= 0) continue;
      const committed = await sumCommittedAgainstSource(prisma, {
        sourceType: 'bulk',
        sourceId: bulkByBill.bulk_request_id,
        variantId: item.variant_id,
      });
      const remaining = Math.max(0, received - committed);
      lines.push({
        variant_id: item.variant_id,
        variant: item.variant,
        source_received_qty: received,
        already_returned_qty: committed,
        remaining_returnable_qty: remaining,
        unit_mrp: item.franchise_mrp_snapshot != null ? Number(item.franchise_mrp_snapshot) : Number(item.variant?.mrp) || 0,
        unit_special_price: Number(item.variant?.special_price) || 0,
        unit_franchise_price:
          item.franchise_unit_price_snapshot != null
            ? Number(item.franchise_unit_price_snapshot)
            : null,
        unit_cost: item.unit_cost_snapshot != null ? Number(item.unit_cost_snapshot) : null,
        batch_number: item.batch_number || null,
      });
    }
    return {
      source_type: 'bulk',
      source_bulk_request_id: bulkByBill.bulk_request_id,
      source_transfer_request_id: null,
      source_bill_number: bulkByBill.transfer_bill_number || null,
      source_reference_number: bulkByBill.bulk_request_number,
      from_warehouse_id: bulkByBill.from_warehouse_id,
      to_shop_id: bulkByBill.to_shop_id,
      warehouse: bulkByBill.from_warehouse,
      shop: bulkByBill.to_shop,
      transfer_status: bulkByBill.status,
      lines,
    };
  }

  const single = await prisma.transferRequest.findFirst({
    where: {
      request_type: 'WH_TO_SHOP',
      to_shop_id: shopId,
      OR: [{ transfer_bill_number: code }, { request_number: code }],
      status: { in: completedStatuses },
    },
    include: {
      from_warehouse: {
        select: {
          warehouse_id: true,
          warehouse_code: true,
          warehouse_name: true,
          city: true,
        },
      },
      to_shop: {
        select: {
          shop_id: true,
          shop_code: true,
          shop_name: true,
          shop_type: true,
          city: true,
        },
      },
      variant: { select: VARIANT_SELECT },
    },
  });

  if (!single) {
    throw new AppError(
      'No inbound warehouse transfer found for this bill/request number at your shop',
      404,
      'SOURCE_TRANSFER_NOT_FOUND'
    );
  }

  const received =
    Number(single.received_quantity) > 0
      ? Number(single.received_quantity)
      : Number(single.quantity) || 0;
  const committed = await sumCommittedAgainstSource(prisma, {
    sourceType: 'single',
    sourceId: single.request_id,
    variantId: single.variant_id,
  });
  const remaining = Math.max(0, received - committed);

  return {
    source_type: 'single',
    source_bulk_request_id: null,
    source_transfer_request_id: single.request_id,
    source_bill_number: single.transfer_bill_number || null,
    source_reference_number: single.request_number,
    from_warehouse_id: single.from_warehouse_id,
    to_shop_id: single.to_shop_id,
    warehouse: single.from_warehouse,
    shop: single.to_shop,
    transfer_status: single.status,
    lines: [
      {
        variant_id: single.variant_id,
        variant: single.variant,
        source_received_qty: received,
        already_returned_qty: committed,
        remaining_returnable_qty: remaining,
        unit_mrp:
          single.franchise_mrp_snapshot != null
            ? Number(single.franchise_mrp_snapshot)
            : Number(single.variant?.mrp) || 0,
        unit_special_price: Number(single.variant?.special_price) || 0,
        unit_franchise_price:
          single.franchise_unit_price_snapshot != null
            ? Number(single.franchise_unit_price_snapshot)
            : null,
        unit_cost: single.unit_cost_snapshot != null ? Number(single.unit_cost_snapshot) : null,
        batch_number: single.batch_number || null,
      },
    ],
  };
};

const buildPricingForLine = (variant, shopType, markupPercent, sourceLine, returnQty) => {
  const qty = Number(returnQty) || 0;
  const unitCost =
    sourceLine.unit_cost != null
      ? Number(sourceLine.unit_cost)
      : roundMoney(
          (Number(variant.purchase_price) || 0) + (Number(variant.expenses) || 0)
        );
  const unitMrp = sourceLine.unit_mrp != null ? Number(sourceLine.unit_mrp) : Number(variant.mrp) || 0;
  const unitSpecial =
    sourceLine.unit_special_price != null
      ? Number(sourceLine.unit_special_price)
      : Number(variant.special_price) || 0;

  let unitFranchise =
    sourceLine.unit_franchise_price != null ? Number(sourceLine.unit_franchise_price) : null;
  let markupSnap = null;

  if (isFranchiseShopType(shopType)) {
    if (unitFranchise == null || !Number.isFinite(unitFranchise)) {
      unitFranchise = calculateFranchiseUnitPrice(variant, markupPercent);
    }
    markupSnap = markupPercent;
  } else if (unitFranchise == null || !Number.isFinite(unitFranchise)) {
    // Owned shop: still stamp a charged unit for return bill (F.Price formula using org markup).
    unitFranchise = calculateFranchiseUnitPrice(variant, markupPercent);
    markupSnap = markupPercent;
  }

  unitFranchise = Math.round(Number(unitFranchise) || 0);

  return {
    unit_cost_snapshot: unitCost,
    line_cost_snapshot: roundMoney(unitCost * qty),
    unit_mrp_snapshot: unitMrp,
    unit_special_price_snapshot: unitSpecial,
    franchise_unit_price_snapshot: unitFranchise,
    franchise_line_value_snapshot: roundMoney(unitFranchise * qty),
    franchise_markup_percent_snapshot: markupSnap,
  };
};

const formatReturnRow = (row) => {
  if (!row) return row;
  const items = (row.items || []).map((item) => {
    const qty =
      item.received_quantity > 0
        ? item.received_quantity
        : item.approved_quantity != null
          ? item.approved_quantity
          : item.return_quantity;
    return {
      ...item,
      display_quantity: qty,
      line_franchise_total:
        item.franchise_line_value_snapshot != null
          ? Number(item.franchise_line_value_snapshot)
          : roundMoney((Number(item.franchise_unit_price_snapshot) || 0) * (Number(qty) || 0)),
    };
  });
  const franchiseSubtotal = roundMoney(
    items.reduce((s, i) => s + (Number(i.line_franchise_total) || 0), 0)
  );
  const mrpSubtotal = roundMoney(
    items.reduce(
      (s, i) =>
        s +
        roundMoney(
          (Number(i.unit_mrp_snapshot) || 0) *
            (Number(i.display_quantity) || 0)
        ),
      0
    )
  );
  return {
    ...row,
    items,
    return_bill_totals: {
      mrp_subtotal: mrpSubtotal,
      franchise_subtotal: franchiseSubtotal,
      discount: roundMoney(mrpSubtotal - franchiseSubtotal),
      final_amount: franchiseSubtotal,
    },
  };
};

const ShopWarehouseReturnService = {
  async previewByBillNumber(lookupCode, user, shopIdQuery = null) {
    const shopId = await resolveShopIdForUser(user, shopIdQuery);
    const source = await resolveSourceTransfer(lookupCode, shopId);
    return source;
  },

  async createReturn(payload, user) {
    const shopId = await resolveShopIdForUser(user, payload.shop_id);
    const lookup = normalizeLookupCode(payload.bill_number || payload.source_number);
    const reason = String(payload.return_reason || '').trim();
    if (!reason) {
      throw new AppError('return_reason is required', 400, 'RETURN_REASON_REQUIRED');
    }

    const itemsInput = Array.isArray(payload.items) ? payload.items : [];
    if (!itemsInput.length) {
      throw new AppError('At least one return item is required', 400, 'RETURN_ITEMS_REQUIRED');
    }

    const source = await resolveSourceTransfer(lookup, shopId);
    if (!source.from_warehouse_id) {
      throw new AppError('Source transfer has no warehouse', 409, 'SOURCE_WAREHOUSE_MISSING');
    }

    const lineByVariant = new Map(source.lines.map((l) => [l.variant_id, l]));
    const shop = await prisma.shop.findUnique({
      where: { shop_id: shopId },
      select: { shop_id: true, shop_type: true },
    });
    if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');

    const markup = await AppSettingsService.getFranchiseMarkupPercent();

    return prisma.$transaction(async (tx) => {
      const prepared = [];
      for (const raw of itemsInput) {
        const variantId = String(raw.variant_id || '').trim();
        const qty = Math.floor(Number(raw.return_quantity));
        if (!variantId) {
          throw new AppError('variant_id is required on each item', 400, 'VARIANT_REQUIRED');
        }
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new AppError('return_quantity must be a positive integer', 400, 'INVALID_RETURN_QTY');
        }
        const sourceLine = lineByVariant.get(variantId);
        if (!sourceLine) {
          throw new AppError(
            `Variant ${variantId} is not on this inbound bill`,
            400,
            'VARIANT_NOT_ON_BILL'
          );
        }

        const committed = await sumCommittedAgainstSource(tx, {
          sourceType: source.source_type,
          sourceId:
            source.source_type === 'bulk'
              ? source.source_bulk_request_id
              : source.source_transfer_request_id,
          variantId,
        });
        const remaining = Math.max(0, sourceLine.source_received_qty - committed);
        if (qty > remaining) {
          throw new AppError(
            `Return qty ${qty} exceeds remaining returnable ${remaining} for ${sourceLine.variant?.product_code || variantId}`,
            409,
            'RETURN_QTY_EXCEEDS_REMAINING',
            { remaining, requested: qty, variant_id: variantId }
          );
        }

        const variant =
          sourceLine.variant ||
          (await tx.productVariant.findUnique({
            where: { variant_id: variantId },
            select: VARIANT_SELECT,
          }));
        if (!variant) throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');

        const pricing = buildPricingForLine(variant, shop.shop_type, markup, sourceLine, qty);
        prepared.push({
          variant_id: variantId,
          source_received_qty: sourceLine.source_received_qty,
          return_quantity: qty,
          batch_number: sourceLine.batch_number || null,
          ...pricing,
        });
      }

      if (!prepared.length) {
        throw new AppError('No valid return items', 400, 'RETURN_ITEMS_REQUIRED');
      }

      const returnNumber = await generateReturnNumber(tx);
      const created = await tx.shopWarehouseReturn.create({
        data: {
          return_number: returnNumber,
          from_shop_id: shopId,
          to_warehouse_id: source.from_warehouse_id,
          source_type: source.source_type,
          source_bulk_request_id: source.source_bulk_request_id,
          source_transfer_request_id: source.source_transfer_request_id,
          source_bill_number: source.source_bill_number,
          source_reference_number: source.source_reference_number,
          status: 'REQUESTED',
          return_reason: reason,
          request_remarks: payload.request_remarks ? String(payload.request_remarks).trim() : null,
          requested_by: user.userId || user.user_id,
          items: { create: prepared },
        },
        include: RETURN_INCLUDE,
      });

      logger.info('Shop warehouse return created', {
        return_id: created.return_id,
        return_number: created.return_number,
        shop_id: shopId,
      });

      return formatReturnRow(created);
    });
  },

  async listReturns(query, user) {
    const { page, limit, skip } = parsePagination(query);
    const where = {};

    if (query.status) where.status = query.status;

    if (user.role === 'SUPER_ADMIN') {
      if (query.shop_id) where.from_shop_id = query.shop_id;
      if (query.warehouse_id) where.to_warehouse_id = query.warehouse_id;
    } else if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
      const whId = user.warehouseId || user.warehouse_id;
      if (!whId) throw new AppError('Warehouse not assigned', 403, 'FORBIDDEN');
      where.to_warehouse_id = whId;
      if (query.shop_id) where.from_shop_id = query.shop_id;
    } else {
      const shopId = await resolveShopIdForUser(user);
      where.from_shop_id = shopId;
    }

    if (query.search) {
      const s = String(query.search).trim();
      where.OR = [
        { return_number: { contains: s, mode: 'insensitive' } },
        { source_bill_number: { contains: s, mode: 'insensitive' } },
        { source_reference_number: { contains: s, mode: 'insensitive' } },
        { return_bill_number: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.shopWarehouseReturn.count({ where }),
      prisma.shopWarehouseReturn.findMany({
        where,
        include: RETURN_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      returns: rows.map(formatReturnRow),
    };
  },

  async getById(returnId, user) {
    const row = await prisma.shopWarehouseReturn.findUnique({
      where: { return_id: returnId },
      include: RETURN_INCLUDE,
    });
    if (!row) throw new AppError('Return request not found', 404, 'RETURN_NOT_FOUND');
    await assertCanViewReturn(user, row);
    return formatReturnRow(row);
  },

  async approve(returnId, payload, user) {
    return prisma.$transaction(async (tx) => {
      const row = await tx.shopWarehouseReturn.findUnique({
        where: { return_id: returnId },
        include: { items: true },
      });
      if (!row) throw new AppError('Return request not found', 404, 'RETURN_NOT_FOUND');
      assertWarehouseActor(user, row.to_warehouse_id);
      if (row.status !== 'REQUESTED') {
        throw new AppError('Only REQUESTED returns can be approved', 409, 'INVALID_RETURN_STATUS');
      }

      const itemUpdates = Array.isArray(payload?.items) ? payload.items : [];
      const updateMap = new Map(
        itemUpdates.map((i) => [String(i.return_item_id), Math.floor(Number(i.approved_quantity))])
      );

      let anyApproved = false;
      for (const item of row.items) {
        let approved = updateMap.has(item.return_item_id)
          ? updateMap.get(item.return_item_id)
          : item.return_quantity;
        if (!Number.isInteger(approved) || approved < 0) {
          throw new AppError('Invalid approved_quantity', 400, 'INVALID_APPROVED_QUANTITY');
        }
        if (approved > item.return_quantity) {
          throw new AppError(
            'approved_quantity cannot exceed requested return_quantity',
            409,
            'INVALID_APPROVED_QUANTITY'
          );
        }
        if (approved > 0) anyApproved = true;

        const lineFranchise = roundMoney(
          (Number(item.franchise_unit_price_snapshot) || 0) * approved
        );
        const lineCost = roundMoney((Number(item.unit_cost_snapshot) || 0) * approved);

        await tx.shopWarehouseReturnItem.update({
          where: { return_item_id: item.return_item_id },
          data: {
            approved_quantity: approved,
            franchise_line_value_snapshot: lineFranchise,
            line_cost_snapshot: lineCost,
          },
        });
      }

      if (!anyApproved) {
        throw new AppError('At least one item must have approved_quantity > 0', 409, 'NO_APPROVED_ITEMS');
      }

      const billType = payload?.return_bill_type || 'NON_GST_INVOICE';
      const validTypes = new Set(['GST_INVOICE', 'NON_GST_INVOICE', 'ESTIMATE_INVOICE']);
      if (!validTypes.has(billType)) {
        throw new AppError('Invalid return_bill_type', 400, 'INVALID_BILL_TYPE');
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { warehouse_id: row.to_warehouse_id },
        select: { warehouse_code: true },
      });
      const returnBillNumber = await generateReturnBillNumber(tx, warehouse?.warehouse_code);

      const updated = await tx.shopWarehouseReturn.update({
        where: { return_id: returnId },
        data: {
          status: 'APPROVED',
          approved_by: user.userId || user.user_id,
          approved_at: new Date(),
          return_bill_type: billType,
          return_bill_number: returnBillNumber,
          return_bill_generated_at: new Date(),
        },
        include: RETURN_INCLUDE,
      });

      return formatReturnRow(updated);
    });
  },

  async reject(returnId, payload, user) {
    const reason = String(payload?.rejection_reason || '').trim();
    if (!reason) {
      throw new AppError('rejection_reason is required', 400, 'REJECTION_REASON_REQUIRED');
    }

    return prisma.$transaction(async (tx) => {
      const row = await tx.shopWarehouseReturn.findUnique({ where: { return_id: returnId } });
      if (!row) throw new AppError('Return request not found', 404, 'RETURN_NOT_FOUND');
      assertWarehouseActor(user, row.to_warehouse_id);
      if (row.status !== 'REQUESTED') {
        throw new AppError('Only REQUESTED returns can be rejected', 409, 'INVALID_RETURN_STATUS');
      }

      const updated = await tx.shopWarehouseReturn.update({
        where: { return_id: returnId },
        data: {
          status: 'REJECTED',
          approved_by: user.userId || user.user_id,
          approved_at: new Date(),
          rejection_reason: reason,
        },
        include: RETURN_INCLUDE,
      });
      return formatReturnRow(updated);
    });
  },

  async dispatch(returnId, user) {
    return prisma.$transaction(async (tx) => {
      const row = await tx.shopWarehouseReturn.findUnique({ where: { return_id: returnId } });
      if (!row) throw new AppError('Return request not found', 404, 'RETURN_NOT_FOUND');
      await assertShopActor(user, row.from_shop_id);
      if (row.status !== 'APPROVED') {
        throw new AppError('Return must be APPROVED before dispatch', 409, 'INVALID_RETURN_STATUS');
      }

      // Intentional: no stock movement on dispatch (stock updates only on WH receive).
      const updated = await tx.shopWarehouseReturn.update({
        where: { return_id: returnId },
        data: {
          status: 'DISPATCHED',
          dispatched_by: user.userId || user.user_id,
          dispatched_at: new Date(),
        },
        include: RETURN_INCLUDE,
      });
      return formatReturnRow(updated);
    });
  },

  async receive(returnId, payload, user) {
    return prisma.$transaction(async (tx) => {
      const row = await tx.shopWarehouseReturn.findUnique({
        where: { return_id: returnId },
        include: {
          items: { include: { variant: { select: VARIANT_SELECT } } },
        },
      });
      if (!row) throw new AppError('Return request not found', 404, 'RETURN_NOT_FOUND');
      assertWarehouseActor(user, row.to_warehouse_id);
      if (row.status !== 'DISPATCHED') {
        throw new AppError('Return must be DISPATCHED before receive', 409, 'INVALID_RETURN_STATUS');
      }

      const actorId = user.userId || user.user_id;

      for (const item of row.items) {
        const qty = Number(item.approved_quantity);
        if (!Number.isInteger(qty) || qty <= 0) continue;
        if (!item.variant) {
          throw new AppError(`Variant missing for return item ${item.return_item_id}`, 500, 'VARIANT_MISSING');
        }

        await receiveShopToWarehouse(tx, {
          variant: item.variant,
          fromShopId: row.from_shop_id,
          toWarehouseId: row.to_warehouse_id,
          quantity: qty,
          batchNumber: item.batch_number || '',
          referenceId: row.return_id,
          referenceType: 'SHOP_WAREHOUSE_RETURN',
          createdBy: actorId,
          remarks: `Return ${row.return_number}`,
          unitCost: item.unit_cost_snapshot,
          lineValue: item.line_cost_snapshot,
        });

        await tx.shopWarehouseReturnItem.update({
          where: { return_item_id: item.return_item_id },
          data: { received_quantity: qty },
        });
      }

      const updated = await tx.shopWarehouseReturn.update({
        where: { return_id: returnId },
        data: {
          status: 'COMPLETED',
          received_by: actorId,
          received_at: new Date(),
          receive_remarks: payload?.receive_remarks
            ? String(payload.receive_remarks).trim()
            : null,
        },
        include: RETURN_INCLUDE,
      });

      logger.info('Shop warehouse return received', {
        return_id: returnId,
        return_number: updated.return_number,
      });

      return formatReturnRow(updated);
    });
  },

  async cancel(returnId, payload, user) {
    const reason = String(payload?.cancel_reason || '').trim() || 'Cancelled';

    return prisma.$transaction(async (tx) => {
      const row = await tx.shopWarehouseReturn.findUnique({ where: { return_id: returnId } });
      if (!row) throw new AppError('Return request not found', 404, 'RETURN_NOT_FOUND');

      if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(row.status)) {
        throw new AppError(`Cannot cancel return in status ${row.status}`, 409, 'INVALID_RETURN_STATUS');
      }

      if (['WH_MANAGER', 'WH_STOCK_LISTER', 'SUPER_ADMIN'].includes(user.role)) {
        if (user.role !== 'SUPER_ADMIN') assertWarehouseActor(user, row.to_warehouse_id);
      } else {
        await assertShopActor(user, row.from_shop_id);
        if (!['REQUESTED', 'APPROVED'].includes(row.status)) {
          throw new AppError(
            'Shop can only cancel before dispatch',
            409,
            'INVALID_RETURN_STATUS'
          );
        }
      }

      const updated = await tx.shopWarehouseReturn.update({
        where: { return_id: returnId },
        data: {
          status: 'CANCELLED',
          cancelled_by: user.userId || user.user_id,
          cancelled_at: new Date(),
          cancel_reason: reason,
        },
        include: RETURN_INCLUDE,
      });
      return formatReturnRow(updated);
    });
  },

  /** Lightweight bill document for UI / PDF consumers. */
  async getReturnBillDocument(returnId, user) {
    const row = await this.getById(returnId, user);
    if (!row.return_bill_number) {
      throw new AppError('Return bill not generated yet (approve first)', 409, 'RETURN_BILL_NOT_READY');
    }
    const lines = (row.items || [])
      .filter((i) => Number(i.approved_quantity ?? i.return_quantity) > 0)
      .map((i, idx) => {
        const qty = Number(i.approved_quantity ?? i.return_quantity) || 0;
        const unit = Number(i.franchise_unit_price_snapshot) || 0;
        const product = i.variant?.product || {};
        return {
          sno: idx + 1,
          product_name: product.name || 'Item',
          product_code: i.variant?.product_code || i.variant?.sku || '',
          brand_name: product.brand_name || '',
          warranty: product.warranty || '',
          hsn_code: product.hsn_code || '',
          gst_percent: product.gst_percent || 0,
          attributes: i.variant?.attributes || null,
          quantity: qty,
          unit_mrp: Number(i.unit_mrp_snapshot) || 0,
          unit_special_price: Number(i.unit_special_price_snapshot) || 0,
          unit_franchise_price: unit,
          unit_charged_price: unit,
          line_mrp_total: roundMoney((Number(i.unit_mrp_snapshot) || 0) * qty),
          line_franchise_total: roundMoney(unit * qty),
        };
      });
    return {
      document_type: 'SHOP_WAREHOUSE_RETURN_BILL',
      return_id: row.return_id,
      return_number: row.return_number,
      return_bill_number: row.return_bill_number,
      return_bill_type: row.return_bill_type || 'NON_GST_INVOICE',
      return_bill_generated_at: row.return_bill_generated_at,
      status: row.status,
      source_bill_number: row.source_bill_number,
      source_reference_number: row.source_reference_number,
      return_reason: row.return_reason,
      from_shop: row.from_shop,
      to_warehouse: row.to_warehouse,
      lines,
      totals: row.return_bill_totals,
    };
  },
};

module.exports = ShopWarehouseReturnService;
