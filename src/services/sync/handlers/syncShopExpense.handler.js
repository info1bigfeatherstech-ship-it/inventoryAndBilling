const { AppError } = require('../../../errors/AppError');
const ShopExpenseService = require('../../purchase/shopExpense.service');

/**
 * Apply an offline-created shop expense using the standard finance pipeline.
 */
const applyOfflineShopExpense = async ({ item, user, shopId }) => {
  const payload = { ...(item.payload || {}) };

  if (!payload.category || !payload.description?.trim()) {
    throw new AppError('category and description are required', 400, 'INVALID_PAYLOAD');
  }

  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('amount must be greater than zero', 400, 'INVALID_AMOUNT');
  }

  const expense = await ShopExpenseService.create(user, {
    shop_id: shopId,
    category: payload.category,
    description: payload.description,
    amount,
    expense_date: payload.expense_date || undefined,
    payment_method: payload.payment_method || null,
    reference_no: payload.reference_no || null,
    remarks: payload.remarks
      ? [payload.offline_expense_number, payload.remarks].filter(Boolean).join(' — ')
      : payload.offline_expense_number || null,
  });

  return {
    server_id: expense.expense_id,
    data: {
      ...expense,
      offline_expense_number: payload.offline_expense_number || null,
      offline_client_id: item.client_id,
    },
  };
};

module.exports = {
  applyOfflineShopExpense,
};
