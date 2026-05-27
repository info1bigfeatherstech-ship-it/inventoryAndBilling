const prisma = require('./prisma.utils');
const { roundMoney } = require('./billing.utils');

/**
 * Generate credit note number CN-YYYYMMDD-NNN
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 */
const generateCreditNoteNumber = async (tx = prisma) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `CN-${y}${m}${d}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const count = await tx.creditNote.count({
    where: { created_at: { gte: startOfDay, lt: endOfDay } },
  });

  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

/**
 * Remaining balance available for redeem or refund.
 * @param {object} creditNote
 */
const getCreditNoteBalance = (creditNote) => {
  const total = roundMoney(creditNote.credit_amount);
  const redeemed = roundMoney(creditNote.amount_redeemed ?? 0);
  const refunded = roundMoney(creditNote.amount_refunded ?? 0);
  return roundMoney(Math.max(0, total - redeemed - refunded));
};

/**
 * Derive status from amounts.
 * @param {object} creditNote
 */
const deriveCreditNoteStatus = (creditNote) => {
  if (creditNote.status === 'CANCELLED') return 'CANCELLED';

  const total = roundMoney(creditNote.credit_amount);
  const redeemed = roundMoney(creditNote.amount_redeemed ?? 0);
  const refunded = roundMoney(creditNote.amount_refunded ?? 0);
  const balance = roundMoney(total - redeemed - refunded);

  if (balance <= 0.01 && refunded > 0 && redeemed <= 0) return 'REFUNDED';
  if (balance <= 0.01 && redeemed > 0) return 'REDEEMED';
  if (redeemed > 0 && balance > 0) return 'PARTIALLY_REDEEMED';
  if (refunded > 0 && balance > 0) return 'PARTIALLY_REDEEMED';
  return 'ACTIVE';
};

module.exports = {
  generateCreditNoteNumber,
  getCreditNoteBalance,
  deriveCreditNoteStatus,
};
