const prisma = require('./prisma.utils');
const { roundMoney } = require('./billing.utils');

/**
 * Net payable for a purchase after issued debit notes and paid vendor allocations.
 * @param {string} purchaseId
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 * @param {string} [excludePaymentId] - exclude allocations from this payment (for updates)
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
 * Enrich purchase rows with payable breakdown.
 */
const enrichPurchasesWithPayable = async (purchases, tx = prisma) => {
  const results = [];
  for (const p of purchases) {
    const outstanding = await getPurchaseOutstanding(p.purchase_id, tx);
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
      net_payable: roundMoney(p.total_amount - (debitAgg._sum.debit_amount || 0)),
      outstanding_amount: outstanding,
    });
  }
  return results;
};

module.exports = {
  getPurchaseOutstanding,
  enrichPurchasesWithPayable,
};
