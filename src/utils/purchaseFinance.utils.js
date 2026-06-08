const prisma = require('./prisma.utils');
const { AppError } = require('../errors/AppError');

/** Explicit delegates — avoids tx[model] when Prisma client is stale or model key is wrong. */
const FINANCE_MODEL_DELEGATES = {
  warehouseExpense: (tx) => tx.warehouseExpense,
  shopExpense: (tx) => tx.shopExpense,
  vendorPayment: (tx) => tx.vendorPayment,
};

const generateDailyNumber = async (tx, { model, prefix }) => {
  const delegate = FINANCE_MODEL_DELEGATES[model]?.(tx);
  if (!delegate?.count) {
    throw new AppError(
      `Finance model "${model}" is unavailable. Restart the server after running: npx prisma generate`,
      500,
      'PRISMA_CLIENT_STALE'
    );
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const fullPrefix = `${prefix}-${y}${m}${d}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const count = await delegate.count({
    where: { created_at: { gte: startOfDay, lt: endOfDay } },
  });

  return `${fullPrefix}${String(count + 1).padStart(4, '0')}`;
};

const generateExpenseNumber = async (tx = prisma) =>
  generateDailyNumber(tx, { model: 'warehouseExpense', prefix: 'EXP' });

const generateShopExpenseNumber = async (tx = prisma) =>
  generateDailyNumber(tx, { model: 'shopExpense', prefix: 'SEXP' });

const generateVendorPaymentNumber = async (tx = prisma) =>
  generateDailyNumber(tx, { model: 'vendorPayment', prefix: 'VPAY' });

const VENDOR_PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'];

module.exports = {
  generateExpenseNumber,
  generateShopExpenseNumber,
  generateVendorPaymentNumber,
  VENDOR_PAYMENT_METHODS,
};
