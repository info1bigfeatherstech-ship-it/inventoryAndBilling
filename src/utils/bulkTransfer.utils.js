const prisma = require('./prisma.utils');

/**
 * Generate bulk request number BTR-YYYYMMDD-NNN
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 */
const generateBulkRequestNumber = async (tx = prisma) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `BTR-${y}${m}${d}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const count = await tx.bulkTransferRequest.count({
    where: { created_at: { gte: startOfDay, lt: endOfDay } },
  });

  return `${prefix}${String(count + 1).padStart(3, '0')}`;
};

/**
 * Dispatchable quantity for a bulk line.
 * @param {object} item
 */
const getDispatchQuantity = (item) => {
  if (item.is_approved === false) return 0;
  return Number(item.approved_quantity ?? item.quantity) || 0;
};

/**
 * Remaining in-transit for a bulk line.
 * @param {object} item
 */
const getBulkItemInTransit = (item) => {
  const dispatched = getDispatchQuantity(item);
  const received = Number(item.received_quantity ?? 0);
  return Math.max(0, dispatched - received);
};

/**
 * Whether bulk request is fully received.
 * @param {object[]} items
 */
const isBulkFullyReceived = (items) =>
  items.every((item) => {
    const dispatchQty = getDispatchQuantity(item);
    if (dispatchQty === 0) return true;
    return Number(item.received_quantity ?? 0) >= dispatchQty;
  });

/**
 * Whether any line has partial receive.
 */
const isBulkPartiallyReceived = (items) => {
  let anyReceived = false;
  let anyPending = false;
  for (const item of items) {
    const dispatchQty = getDispatchQuantity(item);
    if (dispatchQty === 0) continue;
    const received = Number(item.received_quantity ?? 0);
    if (received > 0) anyReceived = true;
    if (received < dispatchQty) anyPending = true;
  }
  return anyReceived && anyPending;
};

module.exports = {
  generateBulkRequestNumber,
  getDispatchQuantity,
  getBulkItemInTransit,
  isBulkFullyReceived,
  isBulkPartiallyReceived,
};
