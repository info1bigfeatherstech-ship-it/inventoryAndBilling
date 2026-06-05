const asyncHandler = require('../../utils/asyncHandler.utils');
const ShopBankAccountService = require('../../services/shop/shopBankAccount.service');
const { successResponse } = require('../../utils/response.utils');

const parseBoolQuery = (value, defaultValue = true) => {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() !== 'false';
};

const ShopBankAccountController = {
  list: asyncHandler(async (req, res) => {
    const result = await ShopBankAccountService.listForShop(req.params.shopId, req.user, {
      active_only: parseBoolQuery(req.query.active_only, true),
      upi_only: parseBoolQuery(req.query.upi_only, false),
    });
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bank accounts fetched successfully',
      data: result.accounts,
      meta: { shop_id: result.shop_id, total: result.accounts.length },
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const account = await ShopBankAccountService.getById(
      req.params.shopId,
      req.params.bankAccountId,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bank account fetched successfully',
      data: account,
    });
  }),

  create: asyncHandler(async (req, res) => {
    const account = await ShopBankAccountService.create(req.params.shopId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Bank account created successfully',
      data: account,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const account = await ShopBankAccountService.update(
      req.params.shopId,
      req.params.bankAccountId,
      req.body,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Bank account updated successfully',
      data: account,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await ShopBankAccountService.remove(
      req.params.shopId,
      req.params.bankAccountId,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: result.deactivated
        ? 'Bank account deactivated (referenced on bills)'
        : 'Bank account deleted successfully',
      data: result,
    });
  }),
};

module.exports = ShopBankAccountController;
