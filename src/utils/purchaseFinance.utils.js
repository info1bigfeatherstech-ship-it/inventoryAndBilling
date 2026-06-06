const prisma = require('./prisma.utils');

const generateDailyNumber = async (tx, { model, field, prefix }) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const fullPrefix = `${prefix}-${y}${m}${d}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const count = await tx[model].count({
    where: { created_at: { gte: startOfDay, lt: endOfDay } },
  });

  return `${fullPrefix}${String(count + 1).padStart(4, '0')}`;
};

const generateExpenseNumber = async (tx = prisma) =>
  generateDailyNumber(tx, { model: 'warehouseExpense', field: 'expense_number', prefix: 'EXP' });

const generateVendorPaymentNumber = async (tx = prisma) =>
  generateDailyNumber(tx, { model: 'vendorPayment', field: 'payment_number', prefix: 'VPAY' });

const VENDOR_PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'];

module.exports = {
  generateExpenseNumber,
  generateVendorPaymentNumber,
  VENDOR_PAYMENT_METHODS,
};
