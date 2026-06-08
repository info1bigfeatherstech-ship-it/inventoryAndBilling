const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { roundMoney } = require('../../utils/billing.utils');
const { generateVendorPaymentNumber } = require('../../utils/purchaseFinance.utils');
const {
  getPurchaseOutstanding,
  getAllocationAvailability,
  assertNoConflictingPendingPayment,
  enrichPurchasesWithPayable,
} = require('../../utils/purchasePayable.utils');
const {
  assertWarehouseFinanceAccess,
  applyWarehouseFinanceScope,
  resolveWarehouseIdForUser,
} = require('../../utils/warehouseFinanceAccess.utils');

const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 };

const PAYMENT_SELECT = {
  payment_id: true,
  payment_number: true,
  vendor_id: true,
  warehouse_id: true,
  amount: true,
  payment_method: true,
  reference_no: true,
  payment_date: true,
  status: true,
  paid_by_user_id: true,
  remarks: true,
  is_cancelled: true,
  created_at: true,
  updated_at: true,
  vendor: {
    select: { vendor_id: true, company_name: true, phone: true },
  },
  warehouse: {
    select: { warehouse_id: true, warehouse_code: true, warehouse_name: true },
  },
  paid_by: {
    select: { user_id: true, name: true },
  },
  allocations: {
    select: {
      allocation_id: true,
      purchase_id: true,
      allocated_amount: true,
      purchase: {
        select: {
          purchase_id: true,
          purchase_number: true,
          vendor_invoice_no: true,
          total_amount: true,
        },
      },
    },
  },
};

const validateAllocations = async (tx, {
  vendorId,
  warehouseId,
  allocations,
  paymentAmount,
  excludePaymentId,
  paymentStatus,
}) => {
  if (!allocations?.length) {
    throw new AppError('At least one purchase allocation is required', 400, 'ALLOCATIONS_REQUIRED');
  }

  let allocSum = 0;
  const seen = new Set();
  const purchaseIds = [];

  for (const row of allocations) {
    if (!row.purchase_id || row.allocated_amount == null) {
      throw new AppError('Each allocation requires purchase_id and allocated_amount', 400, 'INVALID_ALLOCATION');
    }
    if (seen.has(row.purchase_id)) {
      throw new AppError('Duplicate purchase in allocations', 400, 'DUPLICATE_ALLOCATION');
    }
    seen.add(row.purchase_id);
    purchaseIds.push(row.purchase_id);

    const amount = roundMoney(row.allocated_amount);
    if (amount <= 0) throw new AppError('Allocation amount must be positive', 400, 'INVALID_ALLOCATION_AMOUNT');
    allocSum = roundMoney(allocSum + amount);

    const purchase = await tx.purchaseEntry.findUnique({
      where: { purchase_id: row.purchase_id },
      select: { purchase_id: true, vendor_id: true, warehouse_id: true, status: true },
    });
    if (!purchase || purchase.status !== 'RECEIVED') {
      throw new AppError(`Purchase ${row.purchase_id} not found or not payable`, 404, 'PURCHASE_NOT_PAYABLE');
    }
    if (purchase.vendor_id !== vendorId || purchase.warehouse_id !== warehouseId) {
      throw new AppError('Purchase does not belong to selected vendor/warehouse', 400, 'ALLOCATION_SCOPE_MISMATCH');
    }

    const available = await getAllocationAvailability(row.purchase_id, tx, excludePaymentId);
    if (amount > available + 0.01) {
      throw new AppError(
        `Allocation exceeds available amount for purchase ${purchase.purchase_id}. Available: ${available}`,
        409,
        'ALLOCATION_EXCEEDS_OUTSTANDING'
      );
    }
  }

  if (paymentStatus === 'PENDING') {
    await assertNoConflictingPendingPayment(tx, { purchaseIds, excludePaymentId });
  }

  if (Math.abs(allocSum - paymentAmount) > 0.01) {
    throw new AppError(
      `Payment amount (${paymentAmount}) must equal sum of allocations (${allocSum})`,
      400,
      'ALLOCATION_SUM_MISMATCH'
    );
  }
};

const enrichPaymentAllocations = async (payment, tx = prisma) => {
  const allocations = [];
  for (const alloc of payment.allocations || []) {
    const outstanding = await getPurchaseOutstanding(alloc.purchase_id, tx);
    allocations.push({
      ...alloc,
      purchase: {
        ...alloc.purchase,
        outstanding_amount: outstanding,
      },
    });
  }
  return { ...payment, allocations };
};

const VendorPaymentService = {
  async list(user, query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 200 });
    const where = applyWarehouseFinanceScope({ is_cancelled: false }, user);

    if (query.warehouse_id) where.warehouse_id = resolveWarehouseIdForUser(user, query.warehouse_id);
    if (query.vendor_id) where.vendor_id = query.vendor_id;
    if (query.status) where.status = query.status;
    if (query.search) {
      const s = String(query.search).trim();
      where.OR = [
        { payment_number: { contains: s, mode: 'insensitive' } },
        { reference_no: { contains: s, mode: 'insensitive' } },
        { vendor: { company_name: { contains: s, mode: 'insensitive' } } },
      ];
    }
    if (query.from_date || query.to_date) {
      where.payment_date = {};
      if (query.from_date) where.payment_date.gte = new Date(query.from_date);
      if (query.to_date) {
        const end = new Date(query.to_date);
        end.setHours(23, 59, 59, 999);
        where.payment_date.lte = end;
      }
    }

    const [total, payments, aggPaid, aggPending] = await Promise.all([
      prisma.vendorPayment.count({ where }),
      prisma.vendorPayment.findMany({
        where,
        skip,
        take,
        orderBy: { payment_date: 'desc' },
        select: PAYMENT_SELECT,
      }),
      prisma.vendorPayment.aggregate({
        where: { ...where, status: 'PAID' },
        _sum: { amount: true },
        _count: { payment_id: true },
      }),
      prisma.vendorPayment.count({ where: { ...where, status: 'PENDING' } }),
    ]);

    const vendorIds = [...new Set(payments.map((p) => p.vendor_id))];

    return {
      total,
      page,
      limit,
      payments,
      summary: {
        total_payments: aggPaid._count.payment_id || 0,
        total_paid: roundMoney(aggPaid._sum.amount || 0),
        pending_count: aggPending,
        vendors_paid: vendorIds.length,
      },
    };
  },

  async getById(user, paymentId) {
    const payment = await prisma.vendorPayment.findUnique({
      where: { payment_id: paymentId },
      select: PAYMENT_SELECT,
    });
    if (!payment || payment.is_cancelled) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    assertWarehouseFinanceAccess(payment.warehouse_id, user);
    return enrichPaymentAllocations(payment);
  },

  async getPayablePurchases(user, query) {
    const warehouseId = resolveWarehouseIdForUser(user, query.warehouse_id);
    assertWarehouseFinanceAccess(warehouseId, user);

    if (!query.vendor_id) {
      throw new AppError('vendor_id is required', 400, 'VENDOR_ID_REQUIRED');
    }

    const excludePaymentId = query.exclude_payment_id || null;

    const purchases = await prisma.purchaseEntry.findMany({
      where: {
        warehouse_id: warehouseId,
        vendor_id: query.vendor_id,
        status: 'RECEIVED',
      },
      orderBy: { purchase_date: 'desc' },
      select: {
        purchase_id: true,
        purchase_number: true,
        vendor_invoice_no: true,
        purchase_date: true,
        total_amount: true,
        vendor: { select: { company_name: true } },
      },
    });

    const enriched = await enrichPurchasesWithPayable(purchases, prisma, excludePaymentId);

    if (excludePaymentId) {
      const linkedIds = new Set(
        (await prisma.vendorPaymentAllocation.findMany({
          where: { payment_id: excludePaymentId },
          select: { purchase_id: true },
        })).map((a) => a.purchase_id)
      );
      return enriched.filter(
        (p) => p.outstanding_amount > 0 || linkedIds.has(p.purchase_id)
      );
    }

    return enriched.filter((p) => p.outstanding_amount > 0);
  },

  async getSettlementStatus(user, query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 200 });

    const where = applyWarehouseFinanceScope({ status: 'RECEIVED' }, user);
    if (query.warehouse_id) where.warehouse_id = resolveWarehouseIdForUser(user, query.warehouse_id);
    if (query.vendor_id) where.vendor_id = query.vendor_id;
    if (query.search) {
      const s = String(query.search).trim();
      where.OR = [
        { purchase_number: { contains: s, mode: 'insensitive' } },
        { vendor_invoice_no: { contains: s, mode: 'insensitive' } },
        { vendor: { company_name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const purchases = await prisma.purchaseEntry.findMany({
      where,
      orderBy: [{ purchase_date: 'desc' }, { purchase_number: 'desc' }],
      select: {
        purchase_id: true,
        purchase_number: true,
        vendor_invoice_no: true,
        purchase_date: true,
        total_amount: true,
        warehouse_id: true,
        vendor_id: true,
        vendor: { select: { vendor_id: true, company_name: true } },
        warehouse: { select: { warehouse_id: true, warehouse_name: true } },
      },
    });

    const enriched = await enrichPurchasesWithPayable(purchases);
    const balanceFilter = query.balance_filter || 'all';

    const filtered = enriched.filter((p) => {
      if (balanceFilter === 'due') return p.outstanding_amount > 0.01;
      if (balanceFilter === 'cleared') return p.outstanding_amount <= 0.01 && p.paid_total > 0;
      if (balanceFilter === 'has_pending') return p.pending_total > 0.01;
      return p.outstanding_amount > 0.01 || p.paid_total > 0.01 || p.pending_total > 0.01;
    });

    const total = filtered.length;
    const pageRows = filtered.slice(skip, skip + take);

    const summary = filtered.reduce(
      (acc, p) => {
        acc.total_bills += 1;
        acc.total_bill_amount = roundMoney(acc.total_bill_amount + p.net_payable);
        acc.total_paid = roundMoney(acc.total_paid + p.paid_total);
        acc.total_pending = roundMoney(acc.total_pending + p.pending_total);
        acc.total_due = roundMoney(acc.total_due + p.outstanding_amount);
        return acc;
      },
      { total_bills: 0, total_bill_amount: 0, total_paid: 0, total_pending: 0, total_due: 0 }
    );

    return { total, page, limit, bills: pageRows, summary };
  },

  async getPaymentsByPurchase(user, purchaseId) {
    const purchase = await prisma.purchaseEntry.findUnique({
      where: { purchase_id: purchaseId },
      select: {
        purchase_id: true,
        purchase_number: true,
        warehouse_id: true,
        vendor_invoice_no: true,
        total_amount: true,
      },
    });
    if (!purchase) {
      throw new AppError('Purchase not found', 404, 'PURCHASE_NOT_FOUND');
    }
    assertWarehouseFinanceAccess(purchase.warehouse_id, user);

    const allocations = await prisma.vendorPaymentAllocation.findMany({
      where: {
        purchase_id: purchaseId,
        payment: { is_cancelled: false },
      },
      orderBy: { payment: { payment_date: 'asc' } },
      select: {
        allocation_id: true,
        allocated_amount: true,
        payment: {
          select: {
            payment_id: true,
            payment_number: true,
            amount: true,
            payment_method: true,
            reference_no: true,
            payment_date: true,
            status: true,
            remarks: true,
            created_at: true,
            updated_at: true,
            paid_by: { select: { name: true } },
          },
        },
      },
    });

    const outstanding = await getPurchaseOutstanding(purchaseId);

    return {
      purchase,
      outstanding_amount: outstanding,
      payments: allocations.map((a) => ({
        payment_id: a.payment.payment_id,
        payment_number: a.payment.payment_number,
        payment_date: a.payment.payment_date,
        status: a.payment.status,
        payment_method: a.payment.payment_method,
        reference_no: a.payment.reference_no,
        remarks: a.payment.remarks,
        total_payment_amount: a.payment.amount,
        allocated_amount: roundMoney(a.allocated_amount),
        paid_by: a.payment.paid_by,
        created_at: a.payment.created_at,
        updated_at: a.payment.updated_at,
      })),
    };
  },

  async create(user, data) {
    const warehouseId = resolveWarehouseIdForUser(user, data.warehouse_id);
    assertWarehouseFinanceAccess(warehouseId, user, { write: true });

    const amount = roundMoney(data.amount);
    if (amount <= 0) throw new AppError('Payment amount must be greater than zero', 400, 'INVALID_AMOUNT');

    const vendor = await prisma.vendor.findUnique({
      where: { vendor_id: data.vendor_id },
      select: { vendor_id: true },
    });
    if (!vendor) throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');

    const status = data.status === 'PENDING' ? 'PENDING' : 'PAID';

    return prisma.$transaction(async (tx) => {
      await validateAllocations(tx, {
        vendorId: data.vendor_id,
        warehouseId,
        allocations: data.allocations,
        paymentAmount: amount,
        paymentStatus: status,
      });

      const payment_number = await generateVendorPaymentNumber(tx);
      const payment = await tx.vendorPayment.create({
        data: {
          payment_number,
          vendor_id: data.vendor_id,
          warehouse_id: warehouseId,
          amount,
          payment_method: data.payment_method,
          reference_no: data.reference_no?.trim() || null,
          payment_date: data.payment_date ? new Date(data.payment_date) : new Date(),
          status,
          paid_by_user_id: user.userId,
          remarks: data.remarks?.trim() || null,
          allocations: {
            create: data.allocations.map((a) => ({
              purchase_id: a.purchase_id,
              allocated_amount: roundMoney(a.allocated_amount),
            })),
          },
        },
        select: PAYMENT_SELECT,
      });
      return payment;
    }, TX_OPTIONS);
  },

  async update(user, paymentId, data) {
    const existing = await prisma.vendorPayment.findUnique({
      where: { payment_id: paymentId },
      select: {
        payment_id: true,
        vendor_id: true,
        warehouse_id: true,
        status: true,
        is_cancelled: true,
      },
    });
    if (!existing || existing.is_cancelled) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    assertWarehouseFinanceAccess(existing.warehouse_id, user, { write: true });

    if (existing.status !== 'PENDING') {
      throw new AppError('Only pending payments can be edited', 409, 'PAYMENT_NOT_EDITABLE');
    }

    const amount = roundMoney(data.amount);
    if (amount <= 0) throw new AppError('Payment amount must be greater than zero', 400, 'INVALID_AMOUNT');

    const status = data.status === 'PAID' ? 'PAID' : 'PENDING';

    return prisma.$transaction(async (tx) => {
      await validateAllocations(tx, {
        vendorId: existing.vendor_id,
        warehouseId: existing.warehouse_id,
        allocations: data.allocations,
        paymentAmount: amount,
        excludePaymentId: paymentId,
        paymentStatus: status,
      });

      await tx.vendorPaymentAllocation.deleteMany({ where: { payment_id: paymentId } });

      const payment = await tx.vendorPayment.update({
        where: { payment_id: paymentId },
        data: {
          amount,
          payment_method: data.payment_method,
          reference_no: data.reference_no?.trim() || null,
          payment_date: data.payment_date ? new Date(data.payment_date) : undefined,
          status,
          remarks: data.remarks?.trim() || null,
          allocations: {
            create: data.allocations.map((a) => ({
              purchase_id: a.purchase_id,
              allocated_amount: roundMoney(a.allocated_amount),
            })),
          },
        },
        select: PAYMENT_SELECT,
      });
      return payment;
    }, TX_OPTIONS);
  },

  async updateStatus(user, paymentId, status) {
    const existing = await prisma.vendorPayment.findUnique({
      where: { payment_id: paymentId },
      select: { payment_id: true, warehouse_id: true, is_cancelled: true, status: true },
    });
    if (!existing || existing.is_cancelled) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    assertWarehouseFinanceAccess(existing.warehouse_id, user, { write: true });

    if (!['PENDING', 'PAID'].includes(status)) {
      throw new AppError('Invalid status', 400, 'INVALID_STATUS');
    }

    return prisma.vendorPayment.update({
      where: { payment_id: paymentId },
      data: { status },
      select: PAYMENT_SELECT,
    });
  },

  async cancel(user, paymentId) {
    const existing = await prisma.vendorPayment.findUnique({
      where: { payment_id: paymentId },
      select: { payment_id: true, warehouse_id: true, is_cancelled: true },
    });
    if (!existing || existing.is_cancelled) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    assertWarehouseFinanceAccess(existing.warehouse_id, user, { cancel: true });

    return prisma.vendorPayment.update({
      where: { payment_id: paymentId },
      data: {
        is_cancelled: true,
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancelled_by_user_id: user.userId,
      },
      select: PAYMENT_SELECT,
    });
  },
};

module.exports = VendorPaymentService;
