const prisma = require('./prisma.utils');

const WH_CODE_MAX = 16;

const sanitizeWhCode = (code) => {
  const normalized = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (normalized || 'WH').slice(0, WH_CODE_MAX);
};

/**
 * FTB-{WHCODE}-{YYYYMMDD}-{SEQ}
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} warehouseCode
 */
const generateTransferBillNumber = async (tx, warehouseCode) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const slug = sanitizeWhCode(warehouseCode);
  const prefix = `FTB-${slug}-${y}${m}${d}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const count = await tx.bulkTransferRequest.count({
    where: {
      transfer_bill_generated_at: { gte: startOfDay, lt: endOfDay },
      transfer_bill_number: { startsWith: prefix },
    },
  });

  return `${prefix}${String(count + 1).padStart(3, '0')}`;
};

const TRANSFER_BILL_READY_STATUSES = new Set([
  'APPROVED',
  'DISPATCHED',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'COMPLETED',
]);

module.exports = {
  generateTransferBillNumber,
  TRANSFER_BILL_READY_STATUSES,
};
