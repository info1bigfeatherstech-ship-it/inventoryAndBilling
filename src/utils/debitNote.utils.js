const prisma = require('./prisma.utils');
const { roundMoney } = require('./billing.utils');

/**
 * Generate debit note number DN-YYYYMMDD-NNNN
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 */
const generateDebitNoteNumber = async (tx = prisma) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `DN-${y}${m}${d}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const count = await tx.debitNote.count({
    where: { created_at: { gte: startOfDay, lt: endOfDay } },
  });

  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

/**
 * Whether stock should be deducted from warehouse for this debit note type.
 */
const typeRequiresStockReturn = (type) => type === 'DEFECTIVE';

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} purchaseId
 * @returns {Promise<Map<string, number>>} purchase_item_id → returned qty
 */
const getReturnedQuantitiesByPurchaseItem = async (purchaseId, tx = prisma) => {
  const lines = await tx.debitNoteLineItem.findMany({
    where: {
      debit_note: {
        original_purchase_id: purchaseId,
        status: { not: 'CANCELLED' },
      },
    },
    select: { purchase_item_id: true, quantity: true },
  });

  const map = new Map();
  for (const line of lines) {
    map.set(line.purchase_item_id, (map.get(line.purchase_item_id) || 0) + line.quantity);
  }
  return map;
};

/**
 * Remaining returnable quantity per purchase line (for UI / validation).
 */
const buildReturnableQuantities = (purchaseItems, alreadyReturnedMap) =>
  purchaseItems.map((item) => {
    const returned = alreadyReturnedMap.get(item.purchase_item_id) || 0;
    const purchased = Number(item.quantity) || 0;
    const returnable = Math.max(0, purchased - returned);
    return {
      purchase_item_id: item.purchase_item_id,
      purchased,
      already_returned: returned,
      returnable,
    };
  });

module.exports = {
  generateDebitNoteNumber,
  typeRequiresStockReturn,
  getReturnedQuantitiesByPurchaseItem,
  buildReturnableQuantities,
  roundMoney,
};
