const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { createStockLedgerEntry } = require('../stock/stockLedger.helpers');
const ShopStockService = require('../shop/shopStock.service');
const CustomerService = require('../customer/customer.service');
const {
  resolveBillingShopId,
  assertBillReadAccess,
  assertBillWriteAccess,
  applyBillListScope,
} = require('../../utils/billAccess.utils');
const {
  roundMoney,
  isIntraStateSupply,
  calculateLineAmounts,
} = require('../../utils/billing.utils');
const {
  generateCreditNoteNumber,
  getCreditNoteBalance,
  deriveCreditNoteStatus,
} = require('../../utils/creditNote.utils');
const logger = require('../../utils/logger.utils');

const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 };

const CREDIT_NOTE_SELECT = {
  credit_note_id: true,
  credit_note_number: true,
  original_bill_id: true,
  shop_id: true,
  customer_id: true,
  customer_mobile: true,
  customer_name: true,
  subtotal: true,
  gst_amount: true,
  credit_amount: true,
  amount_redeemed: true,
  amount_refunded: true,
  status: true,
  redeemed_at: true,
  redeemed_at_shop_id: true,
  redeemed_against_bill_id: true,
  refunded_at: true,
  refund_method: true,
  refund_reference_no: true,
  remarks: true,
  created_by_user_id: true,
  created_at: true,
  updated_at: true,
  original_bill: { select: { bill_id: true, bill_number: true, bill_type: true, is_cancelled: true } },
  redeemed_against_bill: { select: { bill_id: true, bill_number: true } },
  shop: { select: { shop_id: true, shop_name: true, shop_code: true } },
  lines: {
    select: {
      line_id: true,
      variant_id: true,
      product_id: true,
      quantity: true,
      unit_price: true,
      gst_percent: true,
      line_subtotal: true,
      tax_amount: true,
      line_total: true,
      variant: { select: { sku: true, product_code: true, product: { select: { name: true } } } },
    },
  },
};

const loadVariant = async (variantId) => {
  const variant = await prisma.productVariant.findUnique({
    where: { variant_id: variantId },
    select: {
      variant_id: true,
      product_id: true,
      is_active: true,
      low_stock_threshold: true,
      product: { select: { name: true, hsn_code: true, gst_percent: true, is_active: true } },
    },
  });
  if (!variant || !variant.is_active || !variant.product.is_active) {
    throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
  }
  return variant;
};

/**
 * Sum quantities already returned on this bill per variant (non-cancelled credit notes).
 */
const getReturnedQuantitiesForBill = async (billId, tx = prisma) => {
  const lines = await tx.creditNoteLineItem.findMany({
    where: {
      credit_note: {
        original_bill_id: billId,
        status: { not: 'CANCELLED' },
      },
    },
    select: { variant_id: true, quantity: true },
  });

  const map = new Map();
  for (const line of lines) {
    map.set(line.variant_id, (map.get(line.variant_id) || 0) + line.quantity);
  }
  return map;
};

/**
 * Apply credit notes to a new bill inside a transaction.
 * @returns {{ creditApplied: number, allocations: Array }}
 */
const applyCreditNotesOnBill = async (
  tx,
  { creditNoteIds, shopId, billId, billTotal, customerId, userId }
) => {
  if (!creditNoteIds?.length) return { creditApplied: 0, allocations: [] };

  const uniqueIds = [...new Set(creditNoteIds)];
  let remainingBill = roundMoney(billTotal);
  let totalApplied = 0;
  const allocations = [];

  for (const creditNoteId of uniqueIds) {
    if (remainingBill <= 0) break;

    const locked = await tx.creditNote.findUnique({ where: { credit_note_id: creditNoteId } });
    if (!locked) throw new AppError(`Credit note not found: ${creditNoteId}`, 404, 'CREDIT_NOTE_NOT_FOUND');
    if (locked.shop_id !== shopId) {
      throw new AppError('Credit note belongs to a different shop', 409, 'CREDIT_NOTE_SHOP_MISMATCH');
    }
    if (!['ACTIVE', 'PARTIALLY_REDEEMED'].includes(locked.status)) {
      throw new AppError(
        `Credit note ${locked.credit_note_number} is not available for redemption`,
        409,
        'CREDIT_NOTE_NOT_ACTIVE',
        { credit_note_id: creditNoteId, status: locked.status }
      );
    }
    if (customerId && locked.customer_id && locked.customer_id !== customerId) {
      throw new AppError('Credit note customer does not match bill customer', 409, 'CREDIT_NOTE_CUSTOMER_MISMATCH');
    }

    const balance = getCreditNoteBalance(locked);
    if (balance <= 0) continue;

    const applyAmount = roundMoney(Math.min(balance, remainingBill));
    const newRedeemed = roundMoney((locked.amount_redeemed ?? 0) + applyAmount);
    const newStatus = deriveCreditNoteStatus({
      ...locked,
      amount_redeemed: newRedeemed,
    });

    await tx.creditNote.update({
      where: { credit_note_id: creditNoteId },
      data: {
        amount_redeemed: newRedeemed,
        status: newStatus,
        redeemed_at: new Date(),
        redeemed_at_shop_id: shopId,
        redeemed_against_bill_id: billId,
      },
    });

    allocations.push({ credit_note_id: creditNoteId, amount: applyAmount });
    totalApplied = roundMoney(totalApplied + applyAmount);
    remainingBill = roundMoney(remainingBill - applyAmount);
  }

  return { creditApplied: totalApplied, allocations };
};

const CreditNoteService = {
  applyCreditNotesOnBill,

  /**
   * Create credit note from an original bill (product return).
   */
  async createCreditNote(data, user) {
    try {
      const bill = await prisma.bill.findUnique({
        where: { bill_id: data.original_bill_id },
        include: {
          items: {
            select: {
              variant_id: true,
              product_id: true,
              quantity: true,
              unit_price: true,
              gst_percent: true,
              hsn_code: true,
            },
          },
          shop: { select: { shop_id: true, state_code: true, is_active: true } },
        },
      });

      if (!bill) throw new AppError('Original bill not found', 404, 'BILL_NOT_FOUND');
      if (bill.is_cancelled) {
        throw new AppError('Cannot create credit note for a cancelled bill', 409, 'BILL_CANCELLED');
      }

      await assertBillWriteAccess(bill.shop_id, user);

      if (!Array.isArray(data.items) || !data.items.length) {
        throw new AppError('At least one return item is required', 400, 'ITEMS_REQUIRED');
      }

      const billLineByVariant = new Map(bill.items.map((i) => [i.variant_id, i]));
      const alreadyReturned = await getReturnedQuantitiesForBill(bill.bill_id);

      const intraState = isIntraStateSupply(
        bill.shop.state_code,
        bill.place_of_supply_state_code
      );
      const billType = bill.bill_type;

      const computedLines = [];
      for (const item of data.items) {
        const variant = await loadVariant(item.variant_id);
        const billLine = billLineByVariant.get(item.variant_id);
        if (!billLine) {
          throw new AppError(
            `Variant ${item.variant_id} was not on the original bill`,
            409,
            'RETURN_ITEM_NOT_ON_BILL'
          );
        }

        const qty = Number(item.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new AppError('Return quantity must be a positive integer', 400, 'INVALID_QUANTITY');
        }

        const prior = alreadyReturned.get(item.variant_id) || 0;
        if (prior + qty > billLine.quantity) {
          throw new AppError(
            `Return quantity exceeds sold quantity for variant ${item.variant_id}. Sold: ${billLine.quantity}, already returned: ${prior}, requested: ${qty}`,
            409,
            'RETURN_QUANTITY_EXCEEDED',
            { sold: billLine.quantity, already_returned: prior, requested: qty }
          );
        }

        const unitPrice = item.unit_price != null ? Number(item.unit_price) : billLine.unit_price;
        const amounts = calculateLineAmounts({
          quantity: qty,
          unitPrice,
          gstPercent: billLine.gst_percent,
          billType,
          isIntraState: intraState,
        });

        computedLines.push({
          variant_id: variant.variant_id,
          product_id: variant.product_id,
          product_name: variant.product.name,
          low_stock_threshold: variant.low_stock_threshold,
          quantity: qty,
          ...amounts,
          unit_price: unitPrice,
          gst_percent: billLine.gst_percent,
        });
      }

      let subtotal = roundMoney(computedLines.reduce((s, l) => s + l.line_subtotal, 0));
      let gstAmount = roundMoney(computedLines.reduce((s, l) => s + l.tax_amount, 0));
      let creditAmount = roundMoney(computedLines.reduce((s, l) => s + l.line_total, 0));

      if (data.refund_amount != null) {
        const requested = roundMoney(data.refund_amount);
        if (Math.abs(requested - creditAmount) > 0.02) {
          throw new AppError(
            `refund_amount (${requested}) does not match calculated credit (${creditAmount})`,
            409,
            'REFUND_AMOUNT_MISMATCH',
            { calculated: creditAmount, requested }
          );
        }
        creditAmount = requested;
      }

      const restoreStock = data.restore_stock !== false;

      const result = await prisma.$transaction(async (tx) => {
        const cnNumber = await generateCreditNoteNumber(tx);

        const creditNote = await tx.creditNote.create({
          data: {
            credit_note_number: cnNumber,
            original_bill_id: bill.bill_id,
            shop_id: bill.shop_id,
            customer_id: bill.customer_id,
            customer_mobile: bill.customer_mobile || '',
            customer_name: bill.customer_name,
            subtotal,
            gst_amount: gstAmount,
            credit_amount: creditAmount,
            amount_redeemed: 0,
            amount_refunded: 0,
            status: 'ACTIVE',
            remarks: data.reason?.trim() || data.remarks?.trim() || null,
            created_by_user_id: user.userId,
            lines: {
              create: computedLines.map((line) => ({
                variant_id: line.variant_id,
                product_id: line.product_id,
                quantity: line.quantity,
                unit_price: line.unit_price,
                gst_percent: line.gst_percent,
                line_subtotal: line.line_subtotal,
                tax_amount: line.tax_amount,
                line_total: line.line_total,
              })),
            },
          },
          select: CREDIT_NOTE_SELECT,
        });

        if (restoreStock) {
          for (const line of computedLines) {
            await ShopStockService.restoreStockForSale(
              tx,
              bill.shop_id,
              line.variant_id,
              line.quantity,
              line.low_stock_threshold
            );

            await createStockLedgerEntry(tx, {
              productId: line.product_id,
              variantId: line.variant_id,
              movementType: 'RETURN',
              quantity: line.quantity,
              toShopId: bill.shop_id,
              referenceId: creditNote.credit_note_id,
              referenceType: 'CREDIT_NOTE',
              createdBy: user.userId,
              remarks: data.reason || `Return — credit note ${cnNumber}`,
            });
          }
        }

        if (bill.customer_id && creditAmount > 0) {
          await CustomerService.updateCustomerSpend(bill.customer_id, -creditAmount, tx);
        }

        return creditNote;
      }, TX_OPTIONS);

      logger.info('Credit note created', {
        credit_note_id: result.credit_note_id,
        credit_note_number: result.credit_note_number,
        credit_amount: result.credit_amount,
        user_id: user.userId,
      });

      return {
        credit_note_id: result.credit_note_id,
        credit_note_number: result.credit_note_number,
        original_bill_number: bill.bill_number,
        credit_amount: result.credit_amount,
        status: result.status,
        lines: result.lines,
      };
    } catch (err) {
      logger.error('createCreditNote failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },

  async listCreditNotes(filters, user) {
    const { page, limit, skip, take } = parsePagination(filters, { page: 1, limit: 20, maxLimit: 100 });
    const where = await applyBillListScope({}, user);

    if (filters.shop_id) {
      const shopId = await resolveBillingShopId(user, filters.shop_id);
      where.shop_id = shopId;
    }
    if (filters.status) where.status = filters.status;
    if (filters.customer_id) where.customer_id = filters.customer_id;
    if (filters.customer_mobile) {
      where.customer_mobile = { contains: String(filters.customer_mobile).trim() };
    }
    if (filters.original_bill_id) where.original_bill_id = filters.original_bill_id;

    const [total, creditNotes] = await Promise.all([
      prisma.creditNote.count({ where }),
      prisma.creditNote.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: CREDIT_NOTE_SELECT,
      }),
    ]);

    const data = creditNotes.map((cn) => ({
      ...cn,
      balance: getCreditNoteBalance(cn),
    }));

    return { total, page, limit, creditNotes: data };
  },

  async getCreditNoteById(creditNoteId, user) {
    const cn = await prisma.creditNote.findUnique({
      where: { credit_note_id: creditNoteId },
      select: CREDIT_NOTE_SELECT,
    });
    if (!cn) throw new AppError('Credit note not found', 404, 'CREDIT_NOTE_NOT_FOUND');
    await assertBillReadAccess(cn.shop_id, user);
    return { ...cn, balance: getCreditNoteBalance(cn) };
  },

  /**
   * Redeem credit note against an existing bill.
   */
  async redeemCreditNote(creditNoteId, data, user) {
    try {
      const cn = await prisma.creditNote.findUnique({ where: { credit_note_id: creditNoteId } });
      if (!cn) throw new AppError('Credit note not found', 404, 'CREDIT_NOTE_NOT_FOUND');
      await assertBillWriteAccess(cn.shop_id, user);

      const againstBill = await prisma.bill.findUnique({
        where: { bill_id: data.against_bill_id },
        select: { bill_id: true, shop_id: true, customer_id: true, is_cancelled: true, total_amount: true, balance_amount: true },
      });
      if (!againstBill) throw new AppError('Bill not found', 404, 'BILL_NOT_FOUND');
      if (againstBill.is_cancelled) throw new AppError('Cannot redeem against a cancelled bill', 409, 'BILL_CANCELLED');
      if (againstBill.shop_id !== cn.shop_id) {
        throw new AppError('Bill and credit note must be from the same shop', 409, 'SHOP_MISMATCH');
      }

      const redeemAmount = roundMoney(data.redeemed_amount);
      if (redeemAmount <= 0) {
        throw new AppError('redeemed_amount must be greater than zero', 400, 'INVALID_AMOUNT');
      }

      const balance = getCreditNoteBalance(cn);
      if (redeemAmount > balance) {
        throw new AppError(
          `Redeem amount exceeds credit note balance. Balance: ${balance}`,
          409,
          'REDEEM_AMOUNT_EXCEEDED'
        );
      }

      const billPayable = roundMoney(againstBill.balance_amount ?? againstBill.total_amount);
      if (redeemAmount > billPayable) {
        throw new AppError(
          `Redeem amount exceeds bill balance. Bill balance: ${billPayable}`,
          409,
          'REDEEM_EXCEEDS_BILL_BALANCE'
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.creditNote.findUnique({ where: { credit_note_id: creditNoteId } });
        const lockedBalance = getCreditNoteBalance(locked);
        if (redeemAmount > lockedBalance) {
          throw new AppError('Credit note balance changed', 409, 'CREDIT_NOTE_BALANCE_CHANGED');
        }

        const newRedeemed = roundMoney((locked.amount_redeemed ?? 0) + redeemAmount);
        const newStatus = deriveCreditNoteStatus({ ...locked, amount_redeemed: newRedeemed });

        const cnUpdated = await tx.creditNote.update({
          where: { credit_note_id: creditNoteId },
          data: {
            amount_redeemed: newRedeemed,
            status: newStatus,
            redeemed_at: new Date(),
            redeemed_at_shop_id: againstBill.shop_id,
            redeemed_against_bill_id: againstBill.bill_id,
          },
          select: CREDIT_NOTE_SELECT,
        });

        const newBillBalance = roundMoney(Math.max(0, billPayable - redeemAmount));
        const newPaid = roundMoney(againstBill.total_amount - newBillBalance);
        await tx.bill.update({
          where: { bill_id: againstBill.bill_id },
          data: {
            balance_amount: newBillBalance,
            paid_amount: newPaid,
            payment_status: newBillBalance <= 0 ? 'PAID' : 'PARTIALLY_PAID',
          },
        });

        return cnUpdated;
      }, TX_OPTIONS);

      logger.info('Credit note redeemed', { credit_note_id: creditNoteId, redeemed_amount: redeemAmount });
      return { ...updated, balance: getCreditNoteBalance(updated) };
    } catch (err) {
      logger.error('redeemCreditNote failed', { creditNoteId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Refund credit note as cash/UPI/bank.
   */
  async refundCreditNote(creditNoteId, data, user) {
    try {
      const cn = await prisma.creditNote.findUnique({ where: { credit_note_id: creditNoteId } });
      if (!cn) throw new AppError('Credit note not found', 404, 'CREDIT_NOTE_NOT_FOUND');
      await assertBillWriteAccess(cn.shop_id, user);

      if (!['ACTIVE', 'PARTIALLY_REDEEMED'].includes(cn.status)) {
        throw new AppError(`Credit note cannot be refunded in status ${cn.status}`, 409, 'INVALID_CREDIT_NOTE_STATUS');
      }

      const refundAmount = roundMoney(data.refund_amount);
      if (refundAmount <= 0) {
        throw new AppError('refund_amount must be greater than zero', 400, 'INVALID_AMOUNT');
      }

      const balance = getCreditNoteBalance(cn);
      if (refundAmount > balance) {
        throw new AppError(
          `Refund amount exceeds available balance. Balance: ${balance}`,
          409,
          'REFUND_AMOUNT_EXCEEDED'
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.creditNote.findUnique({ where: { credit_note_id: creditNoteId } });
        const lockedBalance = getCreditNoteBalance(locked);
        if (refundAmount > lockedBalance) {
          throw new AppError('Credit note balance changed', 409, 'CREDIT_NOTE_BALANCE_CHANGED');
        }

        const newRefundedTotal = roundMoney((locked.amount_refunded ?? 0) + refundAmount);
        const updatedCn = {
          ...locked,
          amount_refunded: newRefundedTotal,
        };

        return tx.creditNote.update({
          where: { credit_note_id: creditNoteId },
          data: {
            amount_refunded: newRefundedTotal,
            status: deriveCreditNoteStatus(updatedCn),
            refunded_at: new Date(),
            refund_method: data.refund_method,
            refund_reference_no: data.reference_no?.trim() || null,
            refunded_by_user_id: user.userId,
          },
          select: CREDIT_NOTE_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Credit note refunded', {
        credit_note_id: creditNoteId,
        refund_amount: refundAmount,
        method: data.refund_method,
      });

      return { ...updated, balance: getCreditNoteBalance(updated) };
    } catch (err) {
      logger.error('refundCreditNote failed', { creditNoteId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  async cancelCreditNote(creditNoteId, data, user) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new AppError('Only SUPER_ADMIN can cancel credit notes', 403, 'FORBIDDEN');
    }

    const cn = await prisma.creditNote.findUnique({
      where: { credit_note_id: creditNoteId },
      include: { lines: true },
    });
    if (!cn) throw new AppError('Credit note not found', 404, 'CREDIT_NOTE_NOT_FOUND');
    if (cn.status === 'CANCELLED') {
      throw new AppError('Credit note is already cancelled', 409, 'CREDIT_NOTE_ALREADY_CANCELLED');
    }
    if ((cn.amount_redeemed ?? 0) > 0 || (cn.amount_refunded ?? 0) > 0) {
      throw new AppError('Cannot cancel a credit note that has been redeemed or refunded', 409, 'CREDIT_NOTE_IN_USE');
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.reverse_stock !== false) {
        for (const line of cn.lines) {
          await ShopStockService.deductStockForSale(tx, cn.shop_id, line.variant_id, line.quantity);

          await createStockLedgerEntry(tx, {
            productId: line.product_id,
            variantId: line.variant_id,
            movementType: 'ADJUSTMENT',
            quantity: line.quantity,
            fromShopId: cn.shop_id,
            referenceId: creditNoteId,
            referenceType: 'CREDIT_NOTE_CANCEL',
            createdBy: user.userId,
            remarks: 'Credit note cancelled — reverse return stock',
          });
        }
      }

      if (cn.customer_id && cn.credit_amount > 0) {
        await CustomerService.updateCustomerSpend(cn.customer_id, cn.credit_amount, tx);
      }

      return tx.creditNote.update({
        where: { credit_note_id: creditNoteId },
        data: {
          status: 'CANCELLED',
          remarks: data.reason?.trim()
            ? `${cn.remarks || ''} [CANCELLED: ${data.reason.trim()}]`.trim()
            : cn.remarks,
        },
        select: CREDIT_NOTE_SELECT,
      });
    }, TX_OPTIONS);

    logger.info('Credit note cancelled', { credit_note_id: creditNoteId });
    return updated;
  },
};

module.exports = CreditNoteService;
