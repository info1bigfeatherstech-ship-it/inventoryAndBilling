const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { createStockLedgerEntry } = require('../stock/stockLedger.helpers');
const ShopStockService = require('../shop/shopStock.service');
const CustomerService = require('../customer/customer.service');
const CreditNoteService = require('../creditNote/creditNote.service');
const { generateBillPdf } = require('./billPdf.service');
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
  aggregateBillTotals,
  splitGstComponents,
  derivePaymentStatus,
  normalizeStateCode,
} = require('../../utils/billing.utils');
const logger = require('../../utils/logger.utils');

const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 };

const BILL_SELECT = {
  bill_id: true,
  bill_number: true,
  shop_id: true,
  customer_id: true,
  bill_type: true,
  customer_mobile: true,
  customer_name: true,
  customer_gstin: true,
  place_of_supply_state_code: true,
  subtotal: true,
  discount: true,
  taxable_amount: true,
  gst_amount: true,
  total_amount: true,
  payment_status: true,
  payment_method: true,
  paid_amount: true,
  balance_amount: true,
  gst_config_id: true,
  bank_account_id: true,
  sales_channel: true,
  pdf_storage_key: true,
  is_cancelled: true,
  cancelled_at: true,
  cancelled_by_user_id: true,
  cancel_reason: true,
  created_by_user_id: true,
  created_at: true,
  updated_at: true,
  shop: {
    select: {
      shop_id: true,
      shop_code: true,
      shop_name: true,
      address: true,
      city: true,
      state_code: true,
      phone: true,
      email: true,
    },
  },
  customer: {
    select: {
      customer_id: true,
      name: true,
      mobile: true,
      loyalty_tier: true,
      gst_number: true,
      state_code: true,
    },
  },
  items: {
    select: {
      line_id: true,
      variant_id: true,
      product_id: true,
      quantity: true,
      unit_price: true,
      price_type: true,
      gst_percent: true,
      hsn_code: true,
      line_subtotal: true,
      discount: true,
      taxable_amount: true,
      tax_amount: true,
      line_total: true,
      variant: {
        select: {
          variant_id: true,
          sku: true,
          product_code: true,
          product: { select: { product_id: true, name: true } },
        },
      },
      product: { select: { product_id: true, name: true } },
    },
  },
  payments: {
    select: {
      payment_id: true,
      amount: true,
      payment_method: true,
      reference_no: true,
      paid_at: true,
      collector: { select: { user_id: true, name: true } },
    },
    orderBy: { paid_at: 'asc' },
  },
};

/**
 * Generate bill number INV-YYYYMMDD-XXXX for a shop/day.
 * @param {string} shopId
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
const generateBillNumber = async (shopId, tx = prisma) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `INV-${y}${m}${d}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const count = await tx.bill.count({
    where: {
      shop_id: shopId,
      created_at: { gte: startOfDay, lt: endOfDay },
    },
  });

  const seq = String(count + 1).padStart(4, '0');
  return `${prefix}${seq}`;
};

const assertShopActive = async (shopId) => {
  const shop = await prisma.shop.findUnique({
    where: { shop_id: shopId },
    select: { shop_id: true, is_active: true, shop_name: true, city: true, state_code: true },
  });
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  if (!shop.is_active) throw new AppError('Shop is inactive', 409, 'SHOP_INACTIVE');
  return shop;
};

const loadVariantsForBill = async (items) => {
  const variantIds = [...new Set(items.map((i) => i.variant_id))];
  const variants = await prisma.productVariant.findMany({
    where: { variant_id: { in: variantIds } },
    select: {
      variant_id: true,
      product_id: true,
      sku: true,
      is_active: true,
      low_stock_threshold: true,
      product: {
        select: {
          product_id: true,
          name: true,
          hsn_code: true,
          gst_percent: true,
          gst_type: true,
          is_active: true,
        },
      },
    },
  });

  const map = new Map(variants.map((v) => [v.variant_id, v]));
  for (const item of items) {
    const variant = map.get(item.variant_id);
    if (!variant || !variant.is_active || !variant.product.is_active) {
      throw new AppError(`Variant not found: ${item.variant_id}`, 404, 'VARIANT_NOT_FOUND');
    }
  }
  return map;
};

const BillingService = {
  /**
   * Create a bill, deduct stock, write ledger, update customer.
   */
  async createBill(data, user) {
    try {
      const shopId = await resolveBillingShopId(user, data.shop_id);
      await assertBillWriteAccess(shopId, user);
      const shop = await assertShopActive(shopId);

      if (!Array.isArray(data.items) || !data.items.length) {
        throw new AppError('At least one bill item is required', 400, 'ITEMS_REQUIRED');
      }

      const variantMap = await loadVariantsForBill(data.items);

      let customer = null;
      if (data.customer_id) {
        customer = await prisma.customer.findUnique({
          where: { customer_id: data.customer_id },
        });
        if (!customer || !customer.is_active) {
          throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
        }
      }

      const billType = data.bill_type || 'GST_INVOICE';
      const placeOfSupply =
        data.place_of_supply_state_code != null
          ? normalizeStateCode(data.place_of_supply_state_code)
          : customer?.state_code
            ? normalizeStateCode(customer.state_code)
            : shop.state_code;

      const intraState = isIntraStateSupply(shop.state_code, placeOfSupply);
      const loyaltyDiscountPercent = customer
        ? await CustomerService.getCustomerDiscountPercent(customer.customer_id)
        : 0;
      const extraDiscountPercent = Math.min(100, Math.max(0, Number(data.discount) || 0));

      const computedLines = data.items.map((item) => {
        const variant = variantMap.get(item.variant_id);
        const qty = Number(item.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new AppError('Item quantity must be a positive integer', 400, 'TRANSFER_QUANTITY_INVALID');
        }
        const unitPrice = Number(item.unit_price);
        if (Number.isNaN(unitPrice) || unitPrice < 0) {
          throw new AppError('unit_price must be >= 0', 400, 'INVALID_UNIT_PRICE');
        }

        const amounts = calculateLineAmounts({
          quantity: qty,
          unitPrice,
          gstPercent: variant.product.gst_percent,
          billType,
          isIntraState: intraState,
          lineDiscount: Number(item.discount) || 0,
        });

        return {
          variant_id: variant.variant_id,
          product_id: variant.product_id,
          quantity: qty,
          unit_price: unitPrice,
          price_type: item.price_type || 'SPECIAL',
          gst_percent: variant.product.gst_percent,
          hsn_code: variant.product.hsn_code,
          product_name: variant.product.name,
          low_stock_threshold: variant.low_stock_threshold,
          ...amounts,
        };
      });

      const totals = aggregateBillTotals(computedLines, extraDiscountPercent, loyaltyDiscountPercent);
      const creditNoteIds = Array.isArray(data.credit_note_ids)
        ? [...new Set(data.credit_note_ids)]
        : [];

      const paymentAmount = data.payment_amount != null ? roundMoney(data.payment_amount) : 0;
      if (paymentAmount > 0 && !data.payment_method) {
        throw new AppError('payment_method is required when payment_amount is provided', 400, 'PAYMENT_METHOD_REQUIRED');
      }

      const result = await prisma.$transaction(async (tx) => {
        for (const line of computedLines) {
          await ShopStockService.deductStockForSale(tx, shopId, line.variant_id, line.quantity);
        }

        const billNumber = await generateBillNumber(shopId, tx);

        const bill = await tx.bill.create({
          data: {
            bill_number: billNumber,
            shop_id: shopId,
            customer_id: customer?.customer_id ?? null,
            bill_type: billType,
            customer_mobile: customer?.mobile ?? data.customer_mobile?.trim() ?? null,
            customer_name: customer?.name ?? data.customer_name?.trim() ?? null,
            customer_gstin: customer?.gst_number ?? data.customer_gstin?.trim() ?? null,
            place_of_supply_state_code: placeOfSupply,
            subtotal: totals.subtotal,
            discount: totals.discount,
            taxable_amount: totals.taxable_amount,
            gst_amount: totals.gst_amount,
            total_amount: totals.total_amount,
            payment_status: 'PENDING',
            payment_method: null,
            paid_amount: 0,
            balance_amount: totals.total_amount,
            gst_config_id: data.gst_config_id ?? null,
            bank_account_id: data.bank_account_id ?? null,
            sales_channel: data.sales_channel || 'WALK_IN',
            created_by_user_id: user.userId,
            items: {
              create: computedLines.map((line) => ({
                variant_id: line.variant_id,
                product_id: line.product_id,
                quantity: line.quantity,
                unit_price: line.unit_price,
                price_type: line.price_type,
                gst_percent: line.gst_percent,
                hsn_code: line.hsn_code,
                line_subtotal: line.line_subtotal,
                discount: line.discount,
                taxable_amount: line.taxable_amount,
                tax_amount: line.tax_amount,
                line_total: line.line_total,
              })),
            },
          },
          select: BILL_SELECT,
        });

        let creditApplied = 0;
        let creditAllocations = [];
        if (creditNoteIds.length) {
          const redemption = await CreditNoteService.applyCreditNotesOnBill(tx, {
            creditNoteIds,
            shopId,
            billId: bill.bill_id,
            billTotal: totals.total_amount,
            customerId: customer?.customer_id ?? null,
            customerMobile: customer?.mobile ?? data.customer_mobile?.trim() ?? null,
            userId: user.userId,
          });
          creditApplied = redemption.creditApplied;
          creditAllocations = redemption.allocations ?? [];
        }

        const finalTotal = roundMoney(Math.max(0, totals.total_amount - creditApplied));
        const paidAmount =
          paymentAmount > 0 ? Math.min(paymentAmount, finalTotal) : 0;
        const balanceAmount = roundMoney(finalTotal - paidAmount);
        const paymentStatus =
          finalTotal <= 0 ? 'PAID' : derivePaymentStatus(finalTotal, paidAmount);

        const billAfterCredit =
          creditApplied > 0
            ? await tx.bill.update({
                where: { bill_id: bill.bill_id },
                data: {
                  total_amount: finalTotal,
                  balance_amount: balanceAmount,
                  paid_amount: paidAmount,
                  payment_status: paymentStatus,
                  payment_method: paidAmount > 0 ? data.payment_method || null : null,
                  discount: roundMoney(totals.discount + creditApplied),
                },
                select: BILL_SELECT,
              })
            : await tx.bill.update({
                where: { bill_id: bill.bill_id },
                data: {
                  paid_amount: paidAmount,
                  balance_amount: balanceAmount,
                  payment_status: paymentStatus,
                  payment_method: paidAmount > 0 ? data.payment_method || null : null,
                },
                select: BILL_SELECT,
              });

        for (const line of computedLines) {
          await createStockLedgerEntry(tx, {
            productId: line.product_id,
            variantId: line.variant_id,
            movementType: 'SALES',
            quantity: line.quantity,
            fromShopId: shopId,
            referenceId: billAfterCredit.bill_id,
            referenceType: 'BILL',
            createdBy: user.userId,
            remarks: `Sale of ${line.quantity} units of ${line.product_name}`,
          });
        }

        if (customer?.customer_id && finalTotal > 0) {
          await CustomerService.updateCustomerSpend(customer.customer_id, finalTotal, tx);
        }

        if (paidAmount > 0 && data.payment_method) {
          await tx.billPayment.create({
            data: {
              bill_id: billAfterCredit.bill_id,
              amount: paidAmount,
              payment_method: data.payment_method,
              reference_no: data.reference_no?.trim() || null,
              collected_by: user.userId,
            },
          });
        }

        return {
          ...billAfterCredit,
          credit_applied: creditApplied,
          credit_notes_applied: creditAllocations,
        };
      }, TX_OPTIONS);

      logger.info('Bill created', {
        bill_id: result.bill_id,
        bill_number: result.bill_number,
        shop_id: shopId,
        total: result.total_amount,
        credit_applied: result.credit_applied ?? 0,
        user_id: user.userId,
      });

      return result;
    } catch (err) {
      logger.error('createBill failed', { error: err.message, stack: err.stack, user_id: user.userId });
      throw err;
    }
  },

  async getBillById(billId, user) {
    const bill = await prisma.bill.findUnique({ where: { bill_id: billId }, select: BILL_SELECT });
    if (!bill) throw new AppError('Bill not found', 404, 'BILL_NOT_FOUND');
    await assertBillReadAccess(bill.shop_id, user);
    return bill;
  },

  async listBills(filters, user) {
    const { page, limit, skip, take } = parsePagination(filters, { page: 1, limit: 20, maxLimit: 100 });
    const where = await applyBillListScope({}, user);

    if (filters.shop_id) {
      const shopId = await resolveBillingShopId(user, filters.shop_id);
      where.shop_id = shopId;
    }

    if (filters.customer_id) where.customer_id = filters.customer_id;
    if (filters.customer_mobile) where.customer_mobile = { contains: String(filters.customer_mobile).trim() };
    if (filters.bill_number) where.bill_number = { contains: String(filters.bill_number).trim(), mode: 'insensitive' };
    if (filters.payment_status) where.payment_status = filters.payment_status;
    if (filters.is_cancelled != null) {
      where.is_cancelled = filters.is_cancelled === true || filters.is_cancelled === 'true';
    }

    if (filters.from_date || filters.to_date) {
      where.created_at = {};
      if (filters.from_date) where.created_at.gte = new Date(filters.from_date);
      if (filters.to_date) {
        const end = new Date(filters.to_date);
        end.setHours(23, 59, 59, 999);
        where.created_at.lte = end;
      }
    }

    const [total, bills] = await Promise.all([
      prisma.bill.count({ where }),
      prisma.bill.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: BILL_SELECT,
      }),
    ]);

    return { total, page, limit, bills };
  },

  async addPayment(billId, data, user) {
    try {
      const bill = await prisma.bill.findUnique({
        where: { bill_id: billId },
        select: { bill_id: true, shop_id: true, is_cancelled: true, total_amount: true, paid_amount: true },
      });
      if (!bill) throw new AppError('Bill not found', 404, 'BILL_NOT_FOUND');
      if (bill.is_cancelled) throw new AppError('Cannot add payment to a cancelled bill', 409, 'BILL_ALREADY_CANCELLED');

      await assertBillWriteAccess(bill.shop_id, user);

      const amount = roundMoney(data.amount);
      if (amount <= 0) throw new AppError('Payment amount must be greater than zero', 400, 'INVALID_PAYMENT_AMOUNT');

      const updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.bill.findUnique({ where: { bill_id: billId } });
        if (locked.is_cancelled) throw new AppError('Bill is cancelled', 409, 'BILL_ALREADY_CANCELLED');

        const newPaid = roundMoney(locked.paid_amount + amount);
        if (newPaid > locked.total_amount + 0.01) {
          throw new AppError(
            `Payment exceeds bill balance. Balance: ${roundMoney(locked.total_amount - locked.paid_amount)}`,
            409,
            'PAYMENT_EXCEEDS_BALANCE'
          );
        }

        await tx.billPayment.create({
          data: {
            bill_id: billId,
            amount,
            payment_method: data.payment_method,
            reference_no: data.reference_no?.trim() || null,
            collected_by: user.userId,
          },
        });

        const paidAmount = Math.min(newPaid, locked.total_amount);
        const balanceAmount = roundMoney(locked.total_amount - paidAmount);
        const paymentStatus = derivePaymentStatus(locked.total_amount, paidAmount);

        return tx.bill.update({
          where: { bill_id: billId },
          data: {
            paid_amount: paidAmount,
            balance_amount: balanceAmount,
            payment_status: paymentStatus,
            payment_method: data.payment_method,
          },
          select: BILL_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Bill payment added', { bill_id: billId, amount, user_id: user.userId });
      return updated;
    } catch (err) {
      logger.error('addPayment failed', { billId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  async cancelBill(billId, data, user) {
    try {
      const existing = await prisma.bill.findUnique({
        where: { bill_id: billId },
        include: {
          items: {
            select: {
              line_id: true,
              variant_id: true,
              product_id: true,
              quantity: true,
              variant: { select: { low_stock_threshold: true, product: { select: { name: true } } } },
            },
          },
        },
      });

      if (!existing) throw new AppError('Bill not found', 404, 'BILL_NOT_FOUND');
      if (existing.is_cancelled) throw new AppError('Bill is already cancelled', 409, 'BILL_ALREADY_CANCELLED');

      await assertBillWriteAccess(existing.shop_id, user);

      const updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.bill.findUnique({
          where: { bill_id: billId },
          include: {
            items: {
              select: {
                variant_id: true,
                product_id: true,
                quantity: true,
                variant: { select: { low_stock_threshold: true, product: { select: { name: true } } } },
              },
            },
          },
        });

        if (locked.is_cancelled) throw new AppError('Bill is already cancelled', 409, 'BILL_ALREADY_CANCELLED');

        for (const item of locked.items) {
          await ShopStockService.restoreStockForSale(
            tx,
            locked.shop_id,
            item.variant_id,
            item.quantity,
            item.variant?.low_stock_threshold ?? 5
          );

          await createStockLedgerEntry(tx, {
            productId: item.product_id,
            variantId: item.variant_id,
            movementType: 'RETURN',
            quantity: item.quantity,
            toShopId: locked.shop_id,
            referenceId: locked.bill_id,
            referenceType: 'BILL_CANCELLATION',
            createdBy: user.userId,
            remarks: `Bill cancellation — restore ${item.quantity} units of ${item.variant?.product?.name || 'product'}`,
          });
        }

        if (locked.customer_id && locked.total_amount > 0) {
          await CustomerService.updateCustomerSpend(locked.customer_id, -locked.total_amount, tx);
        }

        return tx.bill.update({
          where: { bill_id: billId },
          data: {
            is_cancelled: true,
            cancelled_at: new Date(),
            cancelled_by_user_id: user.userId,
            cancel_reason: data.reason?.trim() || null,
            payment_status: 'CANCELLED',
          },
          select: BILL_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Bill cancelled', { bill_id: billId, user_id: user.userId });
      return updated;
    } catch (err) {
      logger.error('cancelBill failed', { billId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  async getDailySummary(shopId, date, user) {
    const resolvedShopId = await resolveBillingShopId(user, shopId);
    await assertBillReadAccess(resolvedShopId, user);

    const day = date ? new Date(date) : new Date();
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const bills = await prisma.bill.findMany({
      where: {
        shop_id: resolvedShopId,
        is_cancelled: false,
        created_at: { gte: start, lt: end },
      },
      select: {
        total_amount: true,
        gst_amount: true,
        payment_method: true,
        payment_status: true,
        paid_amount: true,
        place_of_supply_state_code: true,
      },
    });

    const shop = await prisma.shop.findUnique({
      where: { shop_id: resolvedShopId },
      select: { state_code: true },
    });

    const summary = {
      shop_id: resolvedShopId,
      date: start.toISOString().slice(0, 10),
      bill_count: bills.length,
      total_amount: 0,
      total_gst: 0,
      total_collected: 0,
      payment_methods: {},
      gst: { cgst: 0, sgst: 0, igst: 0 },
    };

    for (const bill of bills) {
      summary.total_amount = roundMoney(summary.total_amount + bill.total_amount);
      summary.total_gst = roundMoney(summary.total_gst + bill.gst_amount);
      summary.total_collected = roundMoney(summary.total_collected + bill.paid_amount);

      const method = bill.payment_method || 'UNSPECIFIED';
      summary.payment_methods[method] = roundMoney((summary.payment_methods[method] || 0) + bill.paid_amount);

      const intra = isIntraStateSupply(shop?.state_code, bill.place_of_supply_state_code);
      const split = splitGstComponents(bill.gst_amount, intra);
      summary.gst.cgst = roundMoney(summary.gst.cgst + split.cgst);
      summary.gst.sgst = roundMoney(summary.gst.sgst + split.sgst);
      summary.gst.igst = roundMoney(summary.gst.igst + split.igst);
    }

    return summary;
  },

  async getGSTReport(shopId, fromDate, toDate, user) {
    const resolvedShopId = await resolveBillingShopId(user, shopId);
    await assertBillReadAccess(resolvedShopId, user);

    const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    const shop = await prisma.shop.findUnique({
      where: { shop_id: resolvedShopId },
      select: { state_code: true, shop_name: true },
    });

    const items = await prisma.billLineItem.findMany({
      where: {
        bill: {
          shop_id: resolvedShopId,
          is_cancelled: false,
          created_at: { gte: start, lte: end },
        },
      },
      select: {
        hsn_code: true,
        gst_percent: true,
        taxable_amount: true,
        tax_amount: true,
        bill: { select: { place_of_supply_state_code: true, gst_amount: true } },
      },
    });

    const hsnMap = new Map();
    let totals = { taxable_value: 0, tax_amount: 0, cgst: 0, sgst: 0, igst: 0 };

    for (const row of items) {
      const key = `${row.hsn_code}|${row.gst_percent}`;
      if (!hsnMap.has(key)) {
        hsnMap.set(key, {
          hsn_code: row.hsn_code,
          gst_percent: row.gst_percent,
          taxable_value: 0,
          tax_amount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        });
      }
      const entry = hsnMap.get(key);
      entry.taxable_value = roundMoney(entry.taxable_value + row.taxable_amount);
      entry.tax_amount = roundMoney(entry.tax_amount + row.tax_amount);

      const intra = isIntraStateSupply(shop?.state_code, row.bill.place_of_supply_state_code);
      const split = splitGstComponents(row.tax_amount, intra);
      entry.cgst = roundMoney(entry.cgst + split.cgst);
      entry.sgst = roundMoney(entry.sgst + split.sgst);
      entry.igst = roundMoney(entry.igst + split.igst);

      totals.taxable_value = roundMoney(totals.taxable_value + row.taxable_amount);
      totals.tax_amount = roundMoney(totals.tax_amount + row.tax_amount);
      totals.cgst = roundMoney(totals.cgst + split.cgst);
      totals.sgst = roundMoney(totals.sgst + split.sgst);
      totals.igst = roundMoney(totals.igst + split.igst);
    }

    return {
      shop_id: resolvedShopId,
      shop_name: shop?.shop_name,
      from_date: start.toISOString().slice(0, 10),
      to_date: new Date(toDate).toISOString().slice(0, 10),
      hsn_summary: [...hsnMap.values()],
      totals,
    };
  },

  async generatePDF(billId, user, { persist = true } = {}) {
    const bill = await this.getBillById(billId, user);
    const pdf = await generateBillPdf(bill, { persist });

    if (pdf.pdf_storage_key && persist) {
      await prisma.bill.update({
        where: { bill_id: billId },
        data: { pdf_storage_key: pdf.pdf_storage_key },
      });
    }

    return { bill, pdf };
  },
};

module.exports = BillingService;
