const asyncHandler = require('../../utils/asyncHandler.utils');
const ShopExpenseService = require('../../services/purchase/shopExpense.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const ShopExpenseController = {
  list: asyncHandler(async (req, res) => {
    const { total, page, limit, expenses, summary } = await ShopExpenseService.list(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shop expenses fetched successfully',
      data: expenses,
      meta: { ...paginatedMeta({ page, limit, total }), summary },
    });
  }),

  create: asyncHandler(async (req, res) => {
    const expense = await ShopExpenseService.create(req.user, req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Shop expense recorded successfully',
      data: expense,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const expense = await ShopExpenseService.update(req.user, req.params.expenseId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shop expense updated successfully',
      data: expense,
    });
  }),

  cancel: asyncHandler(async (req, res) => {
    const expense = await ShopExpenseService.cancel(req.user, req.params.expenseId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shop expense cancelled successfully',
      data: expense,
    });
  }),
};

module.exports = ShopExpenseController;
