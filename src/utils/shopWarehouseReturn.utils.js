const prisma = require('./prisma.utils');

const sanitizeWhCode = (code) => {
  const normalized = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (normalized || 'WH').slice(0, 16);
};

/**
 * RTB-{WHCODE}-{YYYYMMDD}-{SEQ} — additive numbering, independent of FTB-*.
 */
const generateReturnBillNumber = async (tx, warehouseCode) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const slug = sanitizeWhCode(warehouseCode);
  const prefix = `RTB-${slug}-${y}${m}${d}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const count = await tx.shopWarehouseReturn.count({
    where: {
      return_bill_generated_at: { gte: startOfDay, lt: endOfDay },
      return_bill_number: { startsWith: prefix },
    },
  });

  return `${prefix}${String(count + 1).padStart(3, '0')}`;
};

const generateReturnNumber = async (tx) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `SWR-${y}${m}${d}-`;
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const count = await tx.shopWarehouseReturn.count({
    where: { created_at: { gte: startOfDay, lt: endOfDay } },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

module.exports = {
  generateReturnBillNumber,
  generateReturnNumber,
};
