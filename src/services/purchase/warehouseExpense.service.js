const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { roundMoney } = require('../../utils/billing.utils');
const { generateExpenseNumber } = require('../../utils/purchaseFinance.utils');
const {
  assertWarehouseFinanceAccess,
  applyWarehouseFinanceScope,
  resolveWarehouseIdForUser,
} = require('../../utils/warehouseFinanceAccess.utils');

const EXPENSE_SELECT = {
  expense_id: true,
  expense_number: true,
  warehouse_id: true,
  category: true,
  description: true,
  amount: true,
  expense_date: true,
  payment_method: true,
  reference_no: true,
  recorded_by_user_id: true,
  remarks: true,
  is_cancelled: true,
  cancelled_at: true,
  created_at: true,
  updated_at: true,
  warehouse: {
    select: { warehouse_id: true, warehouse_code: true, warehouse_name: true },
  },
  recorded_by: {
    select: { user_id: true, name: true },
  },
};

const WarehouseExpenseService = {
  async list(user, query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 200 });
    const where = applyWarehouseFinanceScope({ is_cancelled: false }, user);

    if (query.warehouse_id) {
      where.warehouse_id = resolveWarehouseIdForUser(user, query.warehouse_id);
    }
    if (query.category) where.category = query.category;
    if (query.search) {
      const s = String(query.search).trim();
      where.OR = [
        { expense_number: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (query.from_date || query.to_date) {
      where.expense_date = {};
      if (query.from_date) where.expense_date.gte = new Date(query.from_date);
      if (query.to_date) {
        const end = new Date(query.to_date);
        end.setHours(23, 59, 59, 999);
        where.expense_date.lte = end;
      }
    }

    const [total, expenses, agg] = await Promise.all([
      prisma.warehouseExpense.count({ where }),
      prisma.warehouseExpense.findMany({
        where,
        skip,
        take,
        orderBy: { expense_date: 'desc' },
        select: EXPENSE_SELECT,
      }),
      prisma.warehouseExpense.aggregate({
        where,
        _sum: { amount: true },
        _count: { expense_id: true },
      }),
    ]);

    return {
      total,
      page,
      limit,
      expenses,
      summary: {
        count: agg._count.expense_id || 0,
        total_amount: roundMoney(agg._sum.amount || 0),
      },
    };
  },

  async create(user, data) {
    const warehouseId = resolveWarehouseIdForUser(user, data.warehouse_id);
    assertWarehouseFinanceAccess(warehouseId, user, { write: true });

    const amount = roundMoney(data.amount);
    if (amount <= 0) throw new AppError('Amount must be greater than zero', 400, 'INVALID_AMOUNT');

    const warehouse = await prisma.warehouse.findUnique({
      where: { warehouse_id: warehouseId },
      select: { warehouse_id: true, is_active: true },
    });
    if (!warehouse?.is_active) throw new AppError('Warehouse not found or inactive', 404, 'WAREHOUSE_NOT_FOUND');

    return prisma.$transaction(async (tx) => {
      const expense_number = await generateExpenseNumber(tx);
      return tx.warehouseExpense.create({
        data: {
          expense_number,
          warehouse_id: warehouseId,
          category: data.category,
          description: data.description.trim(),
          amount,
          expense_date: data.expense_date ? new Date(data.expense_date) : new Date(),
          payment_method: data.payment_method || null,
          reference_no: data.reference_no?.trim() || null,
          recorded_by_user_id: user.userId,
          remarks: data.remarks?.trim() || null,
        },
        select: EXPENSE_SELECT,
      });
    });
  },

  async update(user, expenseId, data) {
    const existing = await prisma.warehouseExpense.findUnique({
      where: { expense_id: expenseId },
      select: { expense_id: true, warehouse_id: true, is_cancelled: true },
    });
    if (!existing || existing.is_cancelled) {
      throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
    }
    assertWarehouseFinanceAccess(existing.warehouse_id, user, { write: true });

    const payload = {};
    if (data.category) payload.category = data.category;
    if (data.description) payload.description = data.description.trim();
    if (data.amount != null) {
      const amount = roundMoney(data.amount);
      if (amount <= 0) throw new AppError('Amount must be greater than zero', 400, 'INVALID_AMOUNT');
      payload.amount = amount;
    }
    if (data.expense_date) payload.expense_date = new Date(data.expense_date);
    if (Object.prototype.hasOwnProperty.call(data, 'payment_method')) {
      payload.payment_method = data.payment_method || null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'reference_no')) {
      payload.reference_no = data.reference_no?.trim() || null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'remarks')) {
      payload.remarks = data.remarks?.trim() || null;
    }

    if (!Object.keys(payload).length) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    return prisma.warehouseExpense.update({
      where: { expense_id: expenseId },
      data: payload,
      select: EXPENSE_SELECT,
    });
  },

  async cancel(user, expenseId) {
    const existing = await prisma.warehouseExpense.findUnique({
      where: { expense_id: expenseId },
      select: { expense_id: true, warehouse_id: true, is_cancelled: true },
    });
    if (!existing || existing.is_cancelled) {
      throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
    }
    assertWarehouseFinanceAccess(existing.warehouse_id, user, { cancel: true });

    return prisma.warehouseExpense.update({
      where: { expense_id: expenseId },
      data: {
        is_cancelled: true,
        cancelled_at: new Date(),
        cancelled_by_user_id: user.userId,
      },
      select: EXPENSE_SELECT,
    });
  },
};

module.exports = WarehouseExpenseService;
