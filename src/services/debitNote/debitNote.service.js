const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { createStockLedgerEntry } = require('../stock/stockLedger.helpers');
const { deductWarehouseStock } = require('../../utils/warehouseStock.utils');
const { calculatePurchaseLineTax, aggregatePurchaseTotals } = require('../../utils/purchaseTax.utils');
const { roundMoney } = require('../../utils/billing.utils');
const {
  generateDebitNoteNumber,
  typeRequiresStockReturn,
  getReturnedQuantitiesByPurchaseItem,
  buildReturnableQuantities,
} = require('../../utils/debitNote.utils');
const {
  assertWarehouseDebitNoteAccess,
  applyDebitNoteListScope,
} = require('../../utils/debitNoteAccess.utils');
const {
  cacheDel,
  cacheDelByPattern,
  productDetailCacheKey,
  productListCachePattern,
} = require('../../utils/cache.utils');
const logger = require('../../utils/logger.utils');
const { generateDebitNotePdf } = require('./debitNotePdf.service');
const {
  resolvePurchaseItemVariant,
  assertResolvedVariantForReturn,
  backfillPurchaseItemVariantIfMissing,
} = require('../../utils/purchaseItemVariant.utils');

const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 };

const DEBIT_NOTE_SELECT = {
  debit_note_id: true,
  debit_note_number: true,
  original_purchase_id: true,
  warehouse_id: true,
  vendor_id: true,
  type: true,
  subtotal: true,
  gst_amount: true,
  debit_amount: true,
  return_stock: true,
  status: true,
  remarks: true,
  created_by_user_id: true,
  created_at: true,
  updated_at: true,
  original_purchase: {
    select: {
      purchase_id: true,
      purchase_number: true,
      vendor_invoice_no: true,
      purchase_date: true,
      total_amount: true,
    },
  },
  warehouse: {
    select: { warehouse_id: true, warehouse_code: true, warehouse_name: true },
  },
  vendor: {
    select: { vendor_id: true, company_name: true, gst_number: true, phone: true },
  },
  lines: {
    select: {
      line_id: true,
      purchase_item_id: true,
      variant_id: true,
      product_id: true,
      quantity: true,
      unit_cost: true,
      gst_percent: true,
      line_subtotal: true,
      tax_amount: true,
      line_total: true,
      batch_number: true,
      variant: {
        select: {
          sku: true,
          product_code: true,
          product: { select: { name: true, product_code: true } },
        },
      },
    },
  },
};

const invalidateProductCaches = async (productId, warehouseId) => {
  await Promise.all([
    cacheDel(productDetailCacheKey(productId)),
    cacheDelByPattern(productListCachePattern(warehouseId)),
  ]);
};

const loadPurchaseForDebitNote = async (purchaseId) => {
  const purchase = await prisma.purchaseEntry.findUnique({
    where: { purchase_id: purchaseId },
    include: {
      items: {
        select: {
          purchase_item_id: true,
          product_id: true,
          variant_id: true,
          quantity: true,
          purchase_cost: true,
          line_subtotal: true,
          gst_percent: true,
          tax_amount: true,
          batch_number: true,
          product: {
            select: {
              name: true,
              gst_percent: true,
              gst_type: true,
              is_active: true,
            },
          },
          variant: {
            select: {
              variant_id: true,
              is_active: true,
              product_id: true,
            },
          },
        },
      },
      vendor: { select: { vendor_id: true, is_active: true, company_name: true } },
      warehouse: { select: { warehouse_id: true, is_active: true, warehouse_name: true } },
    },
  });

  if (!purchase) {
    throw new AppError('Purchase entry not found', 404, 'PURCHASE_NOT_FOUND');
  }
  if (purchase.status === 'CANCELLED') {
    throw new AppError('Cannot issue debit note against a cancelled purchase', 409, 'PURCHASE_CANCELLED');
  }
  if (!purchase.vendor?.is_active) {
    throw new AppError('Vendor is inactive', 409, 'VENDOR_INACTIVE');
  }
  if (!purchase.warehouse?.is_active) {
    throw new AppError('Warehouse is inactive', 409, 'WAREHOUSE_INACTIVE');
  }

  return purchase;
};

const resolveReturnStockFlag = (type, explicitFlag) => {
  const required = typeRequiresStockReturn(type);
  if (explicitFlag === true) {
    if (!required && type !== 'OTHER') {
      throw new AppError(
        `return_stock is only allowed for DEFECTIVE or OTHER debit note types (got ${type})`,
        400,
        'RETURN_STOCK_NOT_ALLOWED'
      );
    }
    return true;
  }
  if (explicitFlag === false && required) {
    throw new AppError('return_stock must be true for DEFECTIVE returns (goods leave warehouse)', 400, 'RETURN_STOCK_REQUIRED');
  }
  return required;
};

const DebitNoteService = {
  /**
   * Returnable quantities per purchase line (for create form).
   */
  async getPurchaseReturnableLines(purchaseId, user) {
    const purchase = await loadPurchaseForDebitNote(purchaseId);
    assertWarehouseDebitNoteAccess(purchase.warehouse_id, user);

    const alreadyReturned = await getReturnedQuantitiesByPurchaseItem(purchaseId);
    const returnable = buildReturnableQuantities(purchase.items, alreadyReturned);

    const lines = await Promise.all(
      purchase.items.map(async (item) => {
        const cap = returnable.find((r) => r.purchase_item_id === item.purchase_item_id);
        const variantResolution = await resolvePurchaseItemVariant(prisma, {
          purchaseItem: item,
          purchaseId: purchase.purchase_id,
        });

        return {
          purchase_item_id: item.purchase_item_id,
          product_id: item.product_id,
          variant_id: variantResolution.variant_id,
          product_name: item.product?.name,
          sku: variantResolution.sku,
          product_code: variantResolution.product_code,
          requires_variant_pick: variantResolution.requires_variant_pick,
          variant_options: variantResolution.variant_options,
          purchased_quantity: item.quantity,
          already_returned: cap?.already_returned ?? 0,
          returnable_quantity: cap?.returnable ?? 0,
          purchase_cost: item.purchase_cost,
          gst_percent: item.gst_percent,
          batch_number: item.batch_number,
        };
      })
    );

    return {
      purchase_id: purchase.purchase_id,
      purchase_number: purchase.purchase_number,
      vendor_invoice_no: purchase.vendor_invoice_no,
      warehouse_id: purchase.warehouse_id,
      vendor_id: purchase.vendor_id,
      vendor_name: purchase.vendor?.company_name,
      lines,
    };
  },

  async createDebitNote(data, user) {
    const purchase = await loadPurchaseForDebitNote(data.original_purchase_id);
    assertWarehouseDebitNoteAccess(purchase.warehouse_id, user, { write: true });

    if (!Array.isArray(data.items) || !data.items.length) {
      throw new AppError('At least one return line is required', 400, 'ITEMS_REQUIRED');
    }

    const noteType = data.type;
    const validTypes = ['SHORTAGE', 'DEFECTIVE', 'RATE_DIFFERENCE', 'OTHER'];
    if (!validTypes.includes(noteType)) {
      throw new AppError(`Invalid debit note type: ${noteType}`, 400, 'INVALID_DEBIT_NOTE_TYPE');
    }

    const returnStock = resolveReturnStockFlag(noteType, data.return_stock);

    const purchaseItemById = new Map(purchase.items.map((i) => [i.purchase_item_id, i]));
    const alreadyReturned = await getReturnedQuantitiesByPurchaseItem(purchase.purchase_id);

    const computedLines = [];

    for (const reqLine of data.items) {
      const purchaseItem = purchaseItemById.get(reqLine.purchase_item_id);
      if (!purchaseItem) {
        throw new AppError(
          `Purchase line ${reqLine.purchase_item_id} does not belong to this purchase`,
          409,
          'PURCHASE_ITEM_NOT_FOUND'
        );
      }

      const qty = Number(reqLine.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new AppError('Return quantity must be a positive integer', 400, 'INVALID_QUANTITY');
      }

      const prior = alreadyReturned.get(purchaseItem.purchase_item_id) || 0;
      const purchased = Number(purchaseItem.quantity);
      if (prior + qty > purchased) {
        throw new AppError(
          `Return quantity exceeds purchased quantity for line ${purchaseItem.purchase_item_id}. Purchased: ${purchased}, already debited: ${prior}, requested: ${qty}`,
          409,
          'RETURN_QUANTITY_EXCEEDED',
          { purchased, already_returned: prior, requested: qty }
        );
      }

      if (!purchaseItem.product?.is_active) {
        throw new AppError('Product is inactive', 409, 'PRODUCT_INACTIVE');
      }

      const { variant } = await assertResolvedVariantForReturn(prisma, {
        purchaseItem,
        purchaseId: purchase.purchase_id,
        requestedVariantId: reqLine.variant_id || null,
      });

      const unitCost = Number(purchaseItem.purchase_cost);
      const amounts = calculatePurchaseLineTax({
        quantity: qty,
        purchaseCost: unitCost,
        gstPercent: purchaseItem.gst_percent ?? purchaseItem.product.gst_percent,
        gstType: purchaseItem.product.gst_type,
      });

      computedLines.push({
        purchase_item_id: purchaseItem.purchase_item_id,
        variant_id: variant.variant_id,
        product_id: purchaseItem.product_id,
        quantity: qty,
        unit_cost: unitCost,
        batch_number: purchaseItem.batch_number ? String(purchaseItem.batch_number).trim() : '',
        existing_variant_id_on_purchase: purchaseItem.variant_id,
        ...amounts,
        line_total: roundMoney(amounts.line_subtotal + amounts.tax_amount),
      });
    }

    const totals = aggregatePurchaseTotals(computedLines);

    const result = await prisma.$transaction(async (tx) => {
      for (const line of computedLines) {
        await backfillPurchaseItemVariantIfMissing(
          tx,
          line.purchase_item_id,
          line.variant_id,
          line.existing_variant_id_on_purchase
        );
      }

      const dnNumber = await generateDebitNoteNumber(tx);

      const debitNote = await tx.debitNote.create({
        data: {
          debit_note_number: dnNumber,
          original_purchase_id: purchase.purchase_id,
          warehouse_id: purchase.warehouse_id,
          vendor_id: purchase.vendor_id,
          type: noteType,
          subtotal: totals.subtotal,
          gst_amount: totals.tax_amount,
          debit_amount: totals.total_amount,
          return_stock: returnStock,
          status: 'ISSUED',
          remarks: data.reason?.trim() || data.remarks?.trim() || null,
          created_by_user_id: user.userId,
          lines: {
            create: computedLines.map((line) => ({
              purchase_item_id: line.purchase_item_id,
              variant_id: line.variant_id,
              product_id: line.product_id,
              quantity: line.quantity,
              unit_cost: line.unit_cost,
              gst_percent: line.gst_percent,
              line_subtotal: line.line_subtotal,
              tax_amount: line.tax_amount,
              line_total: line.line_total,
              batch_number: line.batch_number || null,
            })),
          },
        },
        select: DEBIT_NOTE_SELECT,
      });

      if (returnStock) {
        for (const line of computedLines) {
          await deductWarehouseStock(
            tx,
            line.variant_id,
            purchase.warehouse_id,
            line.quantity,
            line.batch_number
          );

          const unitCost = line.unit_cost;
          await createStockLedgerEntry(tx, {
            productId: line.product_id,
            variantId: line.variant_id,
            movementType: 'PURCHASE_RETURN',
            quantity: line.quantity,
            fromWarehouseId: purchase.warehouse_id,
            referenceId: debitNote.debit_note_id,
            referenceType: 'DEBIT_NOTE',
            batchNumber: line.batch_number || null,
            unitCost,
            lineValue: line.line_subtotal,
            createdBy: user.userId,
            remarks: data.reason || `Debit note ${dnNumber} — return to vendor`,
          });
        }
      }

      return debitNote;
    }, TX_OPTIONS);

    const touchedProducts = new Set(computedLines.map((l) => l.product_id));
    if (returnStock) {
      await Promise.all(
        [...touchedProducts].map((productId) =>
          invalidateProductCaches(productId, purchase.warehouse_id)
        )
      );
    }

    logger.info('Debit note created', {
      debit_note_id: result.debit_note_id,
      debit_note_number: result.debit_note_number,
      debit_amount: result.debit_amount,
      return_stock: result.return_stock,
      user_id: user.userId,
    });

    return {
      debit_note_id: result.debit_note_id,
      debit_note_number: result.debit_note_number,
      original_purchase_number: purchase.purchase_number,
      debit_amount: result.debit_amount,
      type: result.type,
      return_stock: result.return_stock,
      status: result.status,
      lines: result.lines,
    };
  },

  async listDebitNotes(filters, user) {
    const { page, limit, skip, take } = parsePagination(filters, { page: 1, limit: 20, maxLimit: 100 });
    const where = {};
    applyDebitNoteListScope(where, user);

    if (filters.vendor_id) where.vendor_id = filters.vendor_id;
    if (filters.warehouse_id) {
      assertWarehouseDebitNoteAccess(filters.warehouse_id, user);
      where.warehouse_id = filters.warehouse_id;
    }
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.original_purchase_id) where.original_purchase_id = filters.original_purchase_id;

    if (filters.from_date || filters.to_date) {
      where.created_at = {};
      if (filters.from_date) where.created_at.gte = new Date(filters.from_date);
      if (filters.to_date) where.created_at.lte = new Date(filters.to_date);
    }

    if (filters.debit_note_number) {
      where.debit_note_number = {
        contains: String(filters.debit_note_number).trim(),
        mode: 'insensitive',
      };
    }

    if (filters.search) {
      const search = String(filters.search).trim();
      where.OR = [
        { debit_note_number: { contains: search, mode: 'insensitive' } },
        { vendor: { company_name: { contains: search, mode: 'insensitive' } } },
        { original_purchase: { purchase_number: { contains: search, mode: 'insensitive' } } },
        { original_purchase: { vendor_invoice_no: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, debitNotes, aggregates] = await Promise.all([
      prisma.debitNote.count({ where }),
      prisma.debitNote.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: DEBIT_NOTE_SELECT,
      }),
      prisma.debitNote.aggregate({
        where: { ...where, status: 'ISSUED' },
        _sum: { debit_amount: true },
        _count: { debit_note_id: true },
      }),
    ]);

    return {
      total,
      page,
      limit,
      debitNotes,
      summary: {
        issued_count: aggregates._count.debit_note_id,
        issued_total_amount: aggregates._sum.debit_amount || 0,
      },
    };
  },

  async getDebitNoteById(debitNoteId, user) {
    const dn = await prisma.debitNote.findUnique({
      where: { debit_note_id: debitNoteId },
      select: DEBIT_NOTE_SELECT,
    });
    if (!dn) throw new AppError('Debit note not found', 404, 'DEBIT_NOTE_NOT_FOUND');
    assertWarehouseDebitNoteAccess(dn.warehouse_id, user);
    return dn;
  },

  async cancelDebitNote(debitNoteId, data, user) {
    if (!['SUPER_ADMIN', 'WH_MANAGER'].includes(user.role)) {
      throw new AppError('Only SUPER_ADMIN or WH_MANAGER can cancel debit notes', 403, 'FORBIDDEN');
    }

    const dn = await prisma.debitNote.findUnique({
      where: { debit_note_id: debitNoteId },
      include: { lines: true },
    });
    if (!dn) throw new AppError('Debit note not found', 404, 'DEBIT_NOTE_NOT_FOUND');
    assertWarehouseDebitNoteAccess(dn.warehouse_id, user, { write: true });

    if (dn.status === 'CANCELLED') {
      throw new AppError('Debit note is already cancelled', 409, 'DEBIT_NOTE_ALREADY_CANCELLED');
    }

    const reverseStock = data.reverse_stock !== false && dn.return_stock;

    const updated = await prisma.$transaction(async (tx) => {
      if (reverseStock) {
        for (const line of dn.lines) {
          const batchNumber = line.batch_number ? String(line.batch_number).trim() : '';
          await tx.productStock.upsert({
            where: {
              variant_id_warehouse_id_batch_number: {
                variant_id: line.variant_id,
                warehouse_id: dn.warehouse_id,
                batch_number: batchNumber,
              },
            },
            update: { quantity: { increment: line.quantity } },
            create: {
              variant_id: line.variant_id,
              product_id: line.product_id,
              warehouse_id: dn.warehouse_id,
              quantity: line.quantity,
              batch_number: batchNumber,
              room_zone: 'DEFAULT',
              rack_shelf: 'DEFAULT',
            },
          });

          await createStockLedgerEntry(tx, {
            productId: line.product_id,
            variantId: line.variant_id,
            movementType: 'ADJUSTMENT',
            quantity: line.quantity,
            toWarehouseId: dn.warehouse_id,
            referenceId: debitNoteId,
            referenceType: 'DEBIT_NOTE_CANCEL',
            batchNumber: batchNumber || null,
            createdBy: user.userId,
            remarks: 'Debit note cancelled — restore stock returned to vendor',
          });
        }
      }

      return tx.debitNote.update({
        where: { debit_note_id: debitNoteId },
        data: {
          status: 'CANCELLED',
          remarks: data.reason?.trim()
            ? `${dn.remarks || ''} [CANCELLED: ${data.reason.trim()}]`.trim()
            : dn.remarks,
        },
        select: DEBIT_NOTE_SELECT,
      });
    }, TX_OPTIONS);

    if (reverseStock) {
      const productIds = [...new Set(dn.lines.map((l) => l.product_id))];
      await Promise.all(
        productIds.map((productId) => invalidateProductCaches(productId, dn.warehouse_id))
      );
    }

    logger.info('Debit note cancelled', { debit_note_id: debitNoteId });
    return updated;
  },

  async generateDebitNotePdf(debitNoteId, user) {
    const dn = await this.getDebitNoteById(debitNoteId, user);
    return generateDebitNotePdf(dn);
  },
};

module.exports = DebitNoteService;
