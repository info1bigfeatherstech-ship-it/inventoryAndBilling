const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { roundMoney } = require('../../utils/billing.utils');
const { generateVendorPaymentNumber } = require('../../utils/purchaseFinance.utils');
const { getPurchaseOutstanding, enrichPurchasesWithPayable } = require('../../utils/purchasePayable.utils');
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

const validateAllocations = async (tx, { vendorId, warehouseId, allocations, paymentAmount, excludePaymentId }) => {
  if (!allocations?.length) {
    throw new AppError('At least one purchase allocation is required', 400, 'ALLOCATIONS_REQUIRED');
  }

  let allocSum = 0;
  const seen = new Set();

  for (const row of allocations) {
    if (!row.purchase_id || row.allocated_amount == null) {
      throw new AppError('Each allocation requires purchase_id and allocated_amount', 400, 'INVALID_ALLOCATION');
    }
    if (seen.has(row.purchase_id)) {
      throw new AppError('Duplicate purchase in allocations', 400, 'DUPLICATE_ALLOCATION');
    }
    seen.add(row.purchase_id);

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

    const outstanding = await getPurchaseOutstanding(row.purchase_id, tx, excludePaymentId);
    if (amount > outstanding + 0.01) {
      throw new AppError(
        `Allocation exceeds outstanding for purchase ${purchase.purchase_id}. Outstanding: ${outstanding}`,
        409,
        'ALLOCATION_EXCEEDS_OUTSTANDING'
      );
    }
  }

  if (Math.abs(allocSum - paymentAmount) > 0.01) {
    throw new AppError(
      `Payment amount (${paymentAmount}) must equal sum of allocations (${allocSum})`,
      400,
      'ALLOCATION_SUM_MISMATCH'
    );
  }
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

  async getPayablePurchases(user, query) {
    const warehouseId = resolveWarehouseIdForUser(user, query.warehouse_id);
    assertWarehouseFinanceAccess(warehouseId, user);

    if (!query.vendor_id) {
      throw new AppError('vendor_id is required', 400, 'VENDOR_ID_REQUIRED');
    }

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

    const enriched = await enrichPurchasesWithPayable(purchases);
    return enriched.filter((p) => p.outstanding_amount > 0);
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

    const status = data.status || 'PAID';

    return prisma.$transaction(async (tx) => {
      await validateAllocations(tx, {
        vendorId: data.vendor_id,
        warehouseId,
        allocations: data.allocations,
        paymentAmount: amount,
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
