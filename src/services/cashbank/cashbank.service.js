const prisma = require('../../utils/prisma.utils');
const { parsePagination } = require('../../utils/pagination.utils');
const { roundMoney } = require('../../utils/billing.utils');
const {
  resolveBillingShopId,
  assertBillReadAccess,
} = require('../../utils/billAccess.utils');

const PAYMENT_SELECT = {
  payment_id: true,
  bill_id: true,
  amount: true,
  payment_method: true,
  reference_no: true,
  paid_at: true,
  collected_by: true,
  bill: {
    select: {
      bill_id: true,
      bill_number: true,
      customer_name: true,
      customer_mobile: true,
      shop_id: true,
      bank_account_id: true,
      staff_code_value: true,
      staff_name_snapshot: true,
      bank_account: {
        select: {
          bank_account_id: true,
          bank_name: true,
          account_number: true,
          upi_id: true,
        },
      },
    },
  },
  collector: {
    select: {
      user_id: true,
      name: true,
    },
  },
};

const buildPaidAtRange = (fromDate, toDate) => {
  if (!fromDate && !toDate) return null;
  const range = {};
  if (fromDate) range.gte = new Date(fromDate);
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
};

const buildBillDateRange = (fromDate, toDate) => {
  if (!fromDate && !toDate) return null;
  const range = {};
  if (fromDate) range.gte = new Date(fromDate);
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
};

const aggregateByMethod = (rows) => {
  const totals = {};
  let grandTotal = 0;
  for (const row of rows) {
    const method = row.payment_method || 'UNSPECIFIED';
    totals[method] = roundMoney((totals[method] || 0) + row.amount);
    grandTotal = roundMoney(grandTotal + row.amount);
  }
  return { totals, grandTotal, count: rows.length };
};

const CashbankService = {
  async listShopCollections(user, query = {}) {
    const shopId = await resolveBillingShopId(user, query.shop_id);
    await assertBillReadAccess(shopId, user);

    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 200 });
    const paidAt = buildPaidAtRange(query.from_date, query.to_date);

    const billFilters = [{ shop_id: shopId }, { is_cancelled: false }];
    if (query.search) {
      const s = String(query.search).trim();
      billFilters.push({
        OR: [
          { bill_number: { contains: s, mode: 'insensitive' } },
          { customer_name: { contains: s, mode: 'insensitive' } },
          { customer_mobile: { contains: s } },
        ],
      });
    }

    const where = { bill: { AND: billFilters } };
    if (paidAt) where.paid_at = paidAt;
    if (query.payment_method) where.payment_method = query.payment_method;

    const [total, payments, allForSummary] = await Promise.all([
      prisma.billPayment.count({ where }),
      prisma.billPayment.findMany({
        where,
        skip,
        take,
        orderBy: { paid_at: 'desc' },
        select: PAYMENT_SELECT,
      }),
      prisma.billPayment.findMany({
        where,
        select: { amount: true, payment_method: true },
      }),
    ]);

    const summary = aggregateByMethod(allForSummary);

    return { total, page, limit, payments, summary, shop_id: shopId };
  },

  async listShopReceivables(user, query = {}) {
    const shopId = await resolveBillingShopId(user, query.shop_id);
    await assertBillReadAccess(shopId, user);

    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 200 });
    const createdAt = buildBillDateRange(query.from_date, query.to_date);

    const where = {
      shop_id: shopId,
      is_cancelled: false,
      balance_amount: { gt: 0 },
    };
    if (createdAt) where.created_at = createdAt;
    if (query.search) {
      const s = String(query.search).trim();
      where.OR = [
        { bill_number: { contains: s, mode: 'insensitive' } },
        { customer_name: { contains: s, mode: 'insensitive' } },
        { customer_mobile: { contains: s } },
      ];
    }

    const [total, bills, agg] = await Promise.all([
      prisma.bill.count({ where }),
      prisma.bill.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: {
          bill_id: true,
          bill_number: true,
          customer_id: true,
          customer_name: true,
          customer_mobile: true,
          total_amount: true,
          paid_amount: true,
          balance_amount: true,
          payment_status: true,
          created_at: true,
          customer: {
            select: {
              customer_id: true,
              credit_limit: true,
              credit_used: true,
              credit_balance: true,
            },
          },
        },
      }),
      prisma.bill.aggregate({
        where,
        _sum: { balance_amount: true, total_amount: true, paid_amount: true },
        _count: { bill_id: true },
      }),
    ]);

    const now = Date.now();
    const withAging = bills.map((bill) => {
      const days = Math.floor((now - new Date(bill.created_at).getTime()) / (1000 * 60 * 60 * 24));
      let aging_bucket = '0-30';
      if (days > 60) aging_bucket = '60+';
      else if (days > 30) aging_bucket = '31-60';
      return { ...bill, days_outstanding: days, aging_bucket };
    });

    return {
      total,
      page,
      limit,
      bills: withAging,
      summary: {
        bill_count: agg._count.bill_id || 0,
        total_outstanding: roundMoney(agg._sum.balance_amount || 0),
        total_billed: roundMoney(agg._sum.total_amount || 0),
        total_collected: roundMoney(agg._sum.paid_amount || 0),
      },
      shop_id: shopId,
    };
  },

  async getShopCashSummary(user, query = {}) {
    const shopId = await resolveBillingShopId(user, query.shop_id);
    await assertBillReadAccess(shopId, user);

    const paidAt = buildPaidAtRange(query.from_date, query.to_date);
    const where = {
      payment_method: 'CASH',
      bill: { shop_id: shopId, is_cancelled: false },
    };
    if (paidAt) where.paid_at = paidAt;

    const [cashInRows, refunds] = await Promise.all([
      prisma.billPayment.findMany({
        where,
        select: {
          payment_id: true,
          amount: true,
          paid_at: true,
          reference_no: true,
          bill: {
            select: {
              bill_number: true,
              customer_name: true,
              staff_code_value: true,
              staff_name_snapshot: true,
            },
          },
          collector: { select: { name: true } },
        },
        orderBy: { paid_at: 'desc' },
      }),
      prisma.creditNote.findMany({
        where: {
          shop_id: shopId,
          amount_refunded: { gt: 0 },
          refund_method: 'CASH',
          ...(paidAt ? { refunded_at: paidAt } : {}),
        },
        select: {
          credit_note_id: true,
          credit_note_number: true,
          amount_refunded: true,
          refunded_at: true,
          refund_reference_no: true,
          customer_name: true,
        },
        orderBy: { refunded_at: 'desc' },
      }),
    ]);

    const cashIn = roundMoney(cashInRows.reduce((s, r) => s + r.amount, 0));
    const cashOut = roundMoney(refunds.reduce((s, r) => s + (r.amount_refunded || 0), 0));
    const openingBalance = roundMoney(Number(query.opening_balance) || 0);

    return {
      shop_id: shopId,
      opening_balance: openingBalance,
      cash_in: cashIn,
      cash_out: cashOut,
      closing_balance: roundMoney(openingBalance + cashIn - cashOut),
      cash_in_entries: cashInRows,
      cash_out_entries: refunds,
    };
  },

  async listShopBankTransactions(user, query = {}) {
    const shopId = await resolveBillingShopId(user, query.shop_id);
    await assertBillReadAccess(shopId, user);

    const paidAt = buildPaidAtRange(query.from_date, query.to_date);
    const bankMethods = ['UPI', 'CARD', 'BANK_TRANSFER'];
    const where = {
      payment_method: { in: bankMethods },
      bill: { shop_id: shopId, is_cancelled: false },
    };
    if (paidAt) where.paid_at = paidAt;
    if (query.bank_account_id) {
      where.bill.bank_account_id = query.bank_account_id;
    }

    const payments = await prisma.billPayment.findMany({
      where,
      orderBy: { paid_at: 'desc' },
      select: PAYMENT_SELECT,
    });

    const refunds = await prisma.creditNote.findMany({
      where: {
        shop_id: shopId,
        amount_refunded: { gt: 0 },
        refund_method: { in: bankMethods },
        ...(paidAt ? { refunded_at: paidAt } : {}),
      },
      select: {
        credit_note_id: true,
        credit_note_number: true,
        amount_refunded: true,
        refund_method: true,
        refund_reference_no: true,
        refunded_at: true,
        customer_name: true,
      },
      orderBy: { refunded_at: 'desc' },
    });

    const credits = roundMoney(payments.reduce((s, p) => s + p.amount, 0));
    const debits = roundMoney(refunds.reduce((s, r) => s + (r.amount_refunded || 0), 0));

    return {
      shop_id: shopId,
      credits,
      debits,
      net: roundMoney(credits - debits),
      payments,
      refunds,
    };
  },
};

module.exports = CashbankService;
