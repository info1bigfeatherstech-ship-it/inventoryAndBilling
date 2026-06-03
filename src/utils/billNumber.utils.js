const prisma = require('./prisma.utils');
const { AppError } = require('../errors/AppError');

const SHOP_CODE_MAX_LEN = 16;
const MAX_ALLOCATION_ATTEMPTS = 50;

/**
 * Normalize shop_code for inclusion in bill numbers (uppercase alphanumeric + hyphen).
 * @param {string} shopCode
 */
const sanitizeShopCodeForBillNumber = (shopCode) => {
  const normalized = String(shopCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) {
    throw new AppError(
      'Shop code must be configured before creating bills',
      409,
      'SHOP_CODE_REQUIRED'
    );
  }

  return normalized.slice(0, SHOP_CODE_MAX_LEN);
};

/**
 * @param {string} shopCode
 * @param {Date} [date]
 */
const buildBillNumberPrefix = (shopCode, date = new Date()) => {
  const slug = sanitizeShopCodeForBillNumber(shopCode);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `INV-${slug}-${y}${m}${d}-`;
};

const getDayBounds = (date = new Date()) => {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  return { startOfDay, endOfDay };
};

/**
 * Allocate a globally unique bill number: INV-{SHOPCODE}-{YYYYMMDD}-{SEQ}
 * Sequence resets per shop per calendar day; collision check handles races and legacy rows.
 *
 * @param {string} shopId
 * @param {import('@prisma/client').Prisma.TransactionClient} [tx]
 */
const generateBillNumber = async (shopId, tx = prisma) => {
  const shop = await tx.shop.findUnique({
    where: { shop_id: shopId },
    select: { shop_code: true },
  });
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');

  const now = new Date();
  const prefix = buildBillNumberPrefix(shop.shop_code, now);
  const { startOfDay, endOfDay } = getDayBounds(now);

  const baseCount = await tx.bill.count({
    where: {
      shop_id: shopId,
      created_at: { gte: startOfDay, lt: endOfDay },
    },
  });

  let seq = baseCount + 1;
  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    const existing = await tx.bill.findUnique({
      where: { bill_number: candidate },
      select: { bill_id: true },
    });
    if (!existing) return candidate;
    seq += 1;
  }

  throw new AppError('Unable to allocate a unique bill number', 500, 'BILL_NUMBER_ALLOCATION_FAILED');
};

module.exports = {
  sanitizeShopCodeForBillNumber,
  buildBillNumberPrefix,
  generateBillNumber,
};
