const asyncHandler = require('../../utils/asyncHandler.utils');
const WarehouseExpenseService = require('../../services/purchase/warehouseExpense.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const WarehouseExpenseController = {
  list: asyncHandler(async (req, res) => {
    const { total, page, limit, expenses, summary } = await WarehouseExpenseService.list(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Warehouse expenses fetched successfully',
      data: expenses,
      meta: { ...paginatedMeta({ page, limit, total }), summary },
    });
  }),

  create: asyncHandler(async (req, res) => {
    const expense = await WarehouseExpenseService.create(req.user, req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Expense recorded successfully',
      data: expense,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const expense = await WarehouseExpenseService.update(req.user, req.params.expenseId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Expense updated successfully',
      data: expense,
    });
  }),

  cancel: asyncHandler(async (req, res) => {
    const expense = await WarehouseExpenseService.cancel(req.user, req.params.expenseId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Expense cancelled successfully',
      data: expense,
    });
  }),
};

module.exports = WarehouseExpenseController;
