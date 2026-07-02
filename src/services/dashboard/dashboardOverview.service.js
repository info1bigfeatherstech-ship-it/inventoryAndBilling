const prisma = require('../../utils/prisma.utils');
const { roundMoney } = require('../../utils/billing.utils');
const { applyBillListScope } = require('../../utils/billAccess.utils');
const { applyWarehouseFinanceScope } = require('../../utils/warehouseFinanceAccess.utils');
const { applyShopFinanceScope } = require('../../utils/shopFinanceAccess.utils');

const SHOP_SCOPED_ROLES = new Set(['SHOP_OWNER', 'SHOP_MANAGER', 'BILLING_STAFF']);
const PURCHASE_EXPENSE_ROLES = new Set(['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER', 'ACCOUNTANT']);

/**
 * Build last N calendar month buckets (oldest first).
 */
const buildMonthBuckets = (months) => {
  const buckets = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-IN', { month: 'short' });
    buckets.push({ month_key: key, month: label, sales: 0, purchase: 0, expenses: 0, profit: 0 });
  }
  return buckets;
};

const getMonthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const sumIntoBucket = (bucketMap, date, amount) => {
  const key = getMonthKey(date);
  if (!bucketMap.has(key)) return;
  bucketMap.set(key, roundMoney((bucketMap.get(key) || 0) + amount));
};

const DashboardOverviewService = {
  async getMonthlyOverview(user, query = {}) {
    const months = Math.min(Math.max(parseInt(query.months, 10) || 6, 1), 12);
    const buckets = buildMonthBuckets(months);

    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const dateRange = { gte: rangeStart, lte: rangeEnd };

    // Future: exclude franchise shops when Shop.is_franchise is added
    const billWhere = await applyBillListScope({ is_cancelled: false, created_at: dateRange }, user);
    if (query.shop_id && user.role === 'SUPER_ADMIN') {
      billWhere.shop_id = query.shop_id;
    }

    const salesByMonth = new Map(buckets.map((b) => [b.month_key, 0]));
    const purchaseByMonth = new Map(buckets.map((b) => [b.month_key, 0]));
    const expensesByMonth = new Map(buckets.map((b) => [b.month_key, 0]));

    const billPromise = prisma.bill.findMany({
      where: billWhere,
      select: { total_amount: true, created_at: true },
    });

    const includePurchases = PURCHASE_EXPENSE_ROLES.has(user.role);
    const includeWarehouseExpenses = PURCHASE_EXPENSE_ROLES.has(user.role);
    const includeShopExpenses =
      user.role === 'SUPER_ADMIN' ||
      user.role === 'ACCOUNTANT' ||
      SHOP_SCOPED_ROLES.has(user.role);

    let purchasePromise = Promise.resolve([]);
    if (includePurchases) {
      const purchaseWhere = applyWarehouseFinanceScope({ status: 'RECEIVED', purchase_date: dateRange }, user);
      if (query.warehouse_id && user.role === 'SUPER_ADMIN') {
        purchaseWhere.warehouse_id = query.warehouse_id;
      }
      purchasePromise = prisma.purchaseEntry.findMany({
        where: purchaseWhere,
        select: { total_amount: true, purchase_date: true },
      });
    }

    let warehouseExpensePromise = Promise.resolve([]);
    if (includeWarehouseExpenses) {
      const whExpWhere = applyWarehouseFinanceScope({ is_cancelled: false, expense_date: dateRange }, user);
      if (query.warehouse_id && user.role === 'SUPER_ADMIN') {
        whExpWhere.warehouse_id = query.warehouse_id;
      }
      warehouseExpensePromise = prisma.warehouseExpense.findMany({
        where: whExpWhere,
        select: { amount: true, expense_date: true },
      });
    }

    let shopExpensePromise = Promise.resolve([]);
    if (includeShopExpenses || SHOP_SCOPED_ROLES.has(user.role) || user.role === 'ACCOUNTANT') {
      const shopExpWhere = applyShopFinanceScope({ is_cancelled: false, expense_date: dateRange }, user);
      if (query.shop_id && user.role === 'SUPER_ADMIN') {
        shopExpWhere.shop_id = query.shop_id;
      }
      shopExpensePromise = prisma.shopExpense.findMany({
        where: shopExpWhere,
        select: { amount: true, expense_date: true },
      });
    }

    const [bills, purchases, warehouseExpenses, shopExpenses] = await Promise.all([
      billPromise,
      purchasePromise,
      warehouseExpensePromise,
      shopExpensePromise,
    ]);

    for (const bill of bills) {
      sumIntoBucket(salesByMonth, bill.created_at, bill.total_amount);
    }
    for (const p of purchases) {
      sumIntoBucket(purchaseByMonth, p.purchase_date, p.total_amount);
    }
    for (const e of warehouseExpenses) {
      sumIntoBucket(expensesByMonth, e.expense_date, e.amount);
    }
    for (const e of shopExpenses) {
      sumIntoBucket(expensesByMonth, e.expense_date, e.amount);
    }

    const series = buckets.map((b) => {
      const sales = salesByMonth.get(b.month_key) || 0;
      const purchase = purchaseByMonth.get(b.month_key) || 0;
      const expenses = expensesByMonth.get(b.month_key) || 0;
      const profit = roundMoney(sales - purchase - expenses);
      return {
        month: b.month,
        month_key: b.month_key,
        sales,
        purchase,
        expenses,
        profit,
      };
    });

    const summary = series.reduce(
      (acc, row) => {
        acc.total_sales = roundMoney(acc.total_sales + row.sales);
        acc.total_purchase = roundMoney(acc.total_purchase + row.purchase);
        acc.total_expenses = roundMoney(acc.total_expenses + row.expenses);
        acc.total_profit = roundMoney(acc.total_profit + row.profit);
        return acc;
      },
      { total_sales: 0, total_purchase: 0, total_expenses: 0, total_profit: 0 }
    );

    return { months, series, summary };
  },
};

module.exports = DashboardOverviewService;
