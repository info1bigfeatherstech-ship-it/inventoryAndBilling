const prisma = require('./prisma.utils');
const { roundMoney } = require('./billing.utils');
const { AppError } = require('../errors/AppError');

/**
 * Net payable for a purchase after issued debit notes and paid vendor allocations.
 * PENDING allocations do not reduce outstanding (only PAID does).
 * @param {string} purchaseId
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 * @param {string} [excludePaymentId] - exclude PAID allocations from this payment (for updates)
 */
const getPurchaseOutstanding = async (purchaseId, tx = prisma, excludePaymentId = null) => {
  const purchase = await tx.purchaseEntry.findUnique({
    where: { purchase_id: purchaseId },
    select: { total_amount: true, status: true },
  });
  if (!purchase || purchase.status === 'CANCELLED') return 0;

  const [debitAgg, paidAgg] = await Promise.all([
    tx.debitNote.aggregate({
      where: { original_purchase_id: purchaseId, status: 'ISSUED' },
      _sum: { debit_amount: true },
    }),
    tx.vendorPaymentAllocation.aggregate({
      where: {
        purchase_id: purchaseId,
        payment: {
          status: 'PAID',
          is_cancelled: false,
          ...(excludePaymentId ? { payment_id: { not: excludePaymentId } } : {}),
        },
      },
      _sum: { allocated_amount: true },
    }),
  ]);

  const debit = debitAgg._sum.debit_amount || 0;
  const paid = paidAgg._sum.allocated_amount || 0;
  return roundMoney(Math.max(0, purchase.total_amount - debit - paid));
};

/**
 * Pending allocations on a purchase (non-cancelled PENDING payments).
 * @param {string} purchaseId
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 * @param {string} [excludePaymentId]
 */
const getPurchasePendingTotal = async (purchaseId, tx = prisma, excludePaymentId = null) => {
  const agg = await tx.vendorPaymentAllocation.aggregate({
    where: {
      purchase_id: purchaseId,
      payment: {
        status: 'PENDING',
        is_cancelled: false,
        ...(excludePaymentId ? { payment_id: { not: excludePaymentId } } : {}),
      },
    },
    _sum: { allocated_amount: true },
  });
  return roundMoney(agg._sum.allocated_amount || 0);
};

/**
 * Max allocatable amount for a purchase (outstanding + current payment's existing allocation when editing).
 */
const getAllocationAvailability = async (purchaseId, tx = prisma, excludePaymentId = null) => {
  const outstanding = await getPurchaseOutstanding(purchaseId, tx, excludePaymentId);
  if (!excludePaymentId) return outstanding;

  const currentAlloc = await tx.vendorPaymentAllocation.findFirst({
    where: { purchase_id: purchaseId, payment_id: excludePaymentId },
    select: { allocated_amount: true },
  });
  return roundMoney(outstanding + (currentAlloc?.allocated_amount || 0));
};

/**
 * Pending allocation details for UI (other payments only when excludePaymentId set).
 */
const getPendingAllocationsForPurchase = async (purchaseId, tx = prisma, excludePaymentId = null) => {
  const rows = await tx.vendorPaymentAllocation.findMany({
    where: {
      purchase_id: purchaseId,
      payment: {
        status: 'PENDING',
        is_cancelled: false,
        ...(excludePaymentId ? { payment_id: { not: excludePaymentId } } : {}),
      },
    },
    select: {
      allocated_amount: true,
      payment: { select: { payment_id: true, payment_number: true } },
    },
  });
  return rows.map((r) => ({
    payment_id: r.payment.payment_id,
    payment_number: r.payment.payment_number,
    allocated_amount: roundMoney(r.allocated_amount),
  }));
};

/**
 * Block multiple PENDING payments on the same purchase bill.
 */
const assertNoConflictingPendingPayment = async (tx, { purchaseIds, excludePaymentId }) => {
  for (const purchaseId of purchaseIds) {
    const conflict = await tx.vendorPaymentAllocation.findFirst({
      where: {
        purchase_id: purchaseId,
        payment: {
          status: 'PENDING',
          is_cancelled: false,
          ...(excludePaymentId ? { payment_id: { not: excludePaymentId } } : {}),
        },
      },
      include: { payment: { select: { payment_number: true } } },
    });
    if (conflict) {
      throw new AppError(
        `Purchase bill already has a pending payment (${conflict.payment.payment_number}). Edit that payment instead.`,
        409,
        'PENDING_PAYMENT_EXISTS'
      );
    }
  }
};

/**
 * Enrich purchase rows with payable breakdown.
 */
const enrichPurchasesWithPayable = async (purchases, tx = prisma, excludePaymentId = null) => {
  const results = [];
  for (const p of purchases) {
    const [outstanding, pendingTotal, pendingAllocations] = await Promise.all([
      getPurchaseOutstanding(p.purchase_id, tx, excludePaymentId),
      getPurchasePendingTotal(p.purchase_id, tx, excludePaymentId),
      getPendingAllocationsForPurchase(p.purchase_id, tx, excludePaymentId),
    ]);
    const debitAgg = await tx.debitNote.aggregate({
      where: { original_purchase_id: p.purchase_id, status: 'ISSUED' },
      _sum: { debit_amount: true },
    });
    const paidAgg = await tx.vendorPaymentAllocation.aggregate({
      where: {
        purchase_id: p.purchase_id,
        payment: { status: 'PAID', is_cancelled: false },
      },
      _sum: { allocated_amount: true },
    });
    results.push({
      ...p,
      debit_note_total: roundMoney(debitAgg._sum.debit_amount || 0),
      paid_total: roundMoney(paidAgg._sum.allocated_amount || 0),
      pending_total: pendingTotal,
      pending_allocations: pendingAllocations,
      net_payable: roundMoney(p.total_amount - (debitAgg._sum.debit_amount || 0)),
      outstanding_amount: outstanding,
      allocation_available: await getAllocationAvailability(p.purchase_id, tx, excludePaymentId),
    });
  }
  return results;
};

module.exports = {
  getPurchaseOutstanding,
  getPurchasePendingTotal,
  getAllocationAvailability,
  getPendingAllocationsForPurchase,
  assertNoConflictingPendingPayment,
  enrichPurchasesWithPayable,
};
