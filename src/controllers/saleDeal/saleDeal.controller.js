const SaleDealService = require('../../services/saleDeal/saleDeal.service');
const asyncHandler = require('../../utils/asyncHandler.utils');
const { successResponse } = require('../../utils/response.utils');

const SaleDealController = {
  list: asyncHandler(async (req, res) => {
    const data = await SaleDealService.listDeals(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Sale deals fetched',
      data: data.deals,
      meta: { total: data.total, page: data.page, limit: data.limit },
    });
  }),

  searchVariants: asyncHandler(async (req, res) => {
    const data = await SaleDealService.searchVariants(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Sale deal variants fetched',
      data,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const deal = await SaleDealService.getDealById(req.params.saleDealId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Sale deal fetched',
      data: deal,
    });
  }),

  create: asyncHandler(async (req, res) => {
    const deal = await SaleDealService.createDeal(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: "Today's deal activated",
      data: deal,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const deal = await SaleDealService.updateDeal(req.params.saleDealId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Sale deal updated',
      data: deal,
    });
  }),

  setActive: asyncHandler(async (req, res) => {
    const deal = await SaleDealService.setActive(
      req.params.saleDealId,
      req.body.is_active,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: deal.is_active ? "Today's deal activated" : 'Sale Off',
      data: deal,
    });
  }),
};

module.exports = SaleDealController;
