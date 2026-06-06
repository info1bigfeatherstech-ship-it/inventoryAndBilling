const prisma = require('../../utils/prisma.utils');
const { roundMoney } = require('../../utils/billing.utils');
const {
  applyWarehouseFinanceScope,
  resolveWarehouseIdForUser,
} = require('../../utils/warehouseFinanceAccess.utils');

const buildDateRange = (fromDate, toDate) => {
  const range = {};
  if (fromDate) range.gte = new Date(fromDate);
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return Object.keys(range).length ? range : null;
};

const PurchasePerformanceService = {
  async getPerformance(user, query = {}) {
    const where = applyWarehouseFinanceScope({ status: 'RECEIVED' }, user);
    if (query.warehouse_id) {
      where.warehouse_id = resolveWarehouseIdForUser(user, query.warehouse_id);
    }
    if (query.vendor_id) where.vendor_id = query.vendor_id;
    const purchaseDate = buildDateRange(query.from_date, query.to_date);
    if (purchaseDate) where.purchase_date = purchaseDate;

    const purchases = await prisma.purchaseEntry.findMany({
      where,
      select: {
        purchase_id: true,
        vendor_id: true,
        warehouse_id: true,
        purchase_number: true,
        purchase_date: true,
        total_amount: true,
        vendor_invoice_no: true,
        vendor: { select: { company_name: true } },
      },
      orderBy: { purchase_date: 'desc' },
    });

    const purchaseIds = purchases.map((p) => p.purchase_id);

    const [debitNotes, allocations, inwards] = await Promise.all([
      purchaseIds.length
        ? prisma.debitNote.findMany({
            where: { original_purchase_id: { in: purchaseIds }, status: 'ISSUED' },
            select: { original_purchase_id: true, debit_amount: true },
          })
        : [],
      purchaseIds.length
        ? prisma.vendorPaymentAllocation.findMany({
            where: {
              purchase_id: { in: purchaseIds },
              payment: { status: 'PAID', is_cancelled: false },
            },
            select: { purchase_id: true, allocated_amount: true },
          })
        : [],
      prisma.inwardReceipt.findMany({
        where: {
          ...(where.warehouse_id ? { warehouse_id: where.warehouse_id } : {}),
          ...(where.vendor_id ? { vendor_id: where.vendor_id } : {}),
          status: 'MAPPED',
          ...(purchaseDate ? { arrived_at: purchaseDate } : {}),
        },
        select: {
          inward_id: true,
          vendor_id: true,
          vendor_invoice_no: true,
          expected_date: true,
          arrived_at: true,
        },
      }),
    ]);

    const debitByPurchase = new Map();
    for (const d of debitNotes) {
      debitByPurchase.set(
        d.original_purchase_id,
        roundMoney((debitByPurchase.get(d.original_purchase_id) || 0) + d.debit_amount)
      );
    }

    const vendorMap = new Map();
    for (const p of purchases) {
      const key = p.vendor_id;
      if (!vendorMap.has(key)) {
        vendorMap.set(key, {
          vendor_id: p.vendor_id,
          vendor_name: p.vendor?.company_name || 'Unknown',
          order_count: 0,
          total_amount: 0,
          debit_note_amount: 0,
          last_purchase_date: null,
        });
      }
      const row = vendorMap.get(key);
      row.order_count += 1;
      row.total_amount = roundMoney(row.total_amount + p.total_amount);
      row.debit_note_amount = roundMoney(
        row.debit_note_amount + (debitByPurchase.get(p.purchase_id) || 0)
      );
      if (!row.last_purchase_date || new Date(p.purchase_date) > new Date(row.last_purchase_date)) {
        row.last_purchase_date = p.purchase_date;
      }
    }

    const vendors = [...vendorMap.values()].map((v) => ({
      ...v,
      avg_order_value: v.order_count ? roundMoney(v.total_amount / v.order_count) : 0,
      return_rate_percent:
        v.total_amount > 0 ? roundMoney((v.debit_note_amount / v.total_amount) * 100) : 0,
    }));

    vendors.sort((a, b) => b.total_amount - a.total_amount);

    const monthlyMap = new Map();
    for (const p of purchases) {
      const d = new Date(p.purchase_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, roundMoney((monthlyMap.get(key) || 0) + p.total_amount));
    }
    const monthly_trend = [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total_amount]) => ({ month, total_amount }));

    let onTimeCount = 0;
    let withExpected = 0;
    for (const inward of inwards) {
      if (!inward.expected_date || !inward.arrived_at) continue;
      withExpected += 1;
      if (new Date(inward.arrived_at) <= new Date(inward.expected_date)) onTimeCount += 1;
    }
    const on_time_rate_percent = withExpected ? roundMoney((onTimeCount / withExpected) * 100) : null;

    const totalOrders = purchases.length;
    const totalAmount = roundMoney(purchases.reduce((s, p) => s + p.total_amount, 0));
    const totalDebit = roundMoney(debitNotes.reduce((s, d) => s + d.debit_amount, 0));

    return {
      summary: {
        total_orders: totalOrders,
        total_amount: totalAmount,
        avg_order_value: totalOrders ? roundMoney(totalAmount / totalOrders) : 0,
        top_vendor: vendors[0]?.vendor_name || null,
        on_time_rate_percent,
        return_rate_percent: totalAmount > 0 ? roundMoney((totalDebit / totalAmount) * 100) : 0,
        unique_vendors: vendors.length,
      },
      vendors,
      monthly_trend,
    };
  },
};

module.exports = PurchasePerformanceService;
