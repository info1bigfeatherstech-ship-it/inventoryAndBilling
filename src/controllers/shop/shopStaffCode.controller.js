const asyncHandler = require('../../utils/asyncHandler.utils');
const ShopStaffCodeService = require('../../services/shop/shopStaffCode.service');
const { successResponse } = require('../../utils/response.utils');

const parseBoolQuery = (value, defaultValue = true) => {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() !== 'false';
};

const ShopStaffCodeController = {
  list: asyncHandler(async (req, res) => {
    const result = await ShopStaffCodeService.listForShop(req.params.shopId, req.user, {
      active_only: parseBoolQuery(req.query.active_only, true),
    });
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Staff codes fetched successfully',
      data: result.staff_codes,
      meta: { shop_id: result.shop_id, total: result.staff_codes.length },
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const row = await ShopStaffCodeService.getById(
      req.params.shopId,
      req.params.staffCodeId,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Staff code fetched successfully',
      data: row,
    });
  }),

  create: asyncHandler(async (req, res) => {
    const row = await ShopStaffCodeService.create(req.params.shopId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Staff code created successfully',
      data: row,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const row = await ShopStaffCodeService.update(
      req.params.shopId,
      req.params.staffCodeId,
      req.body,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Staff code updated successfully',
      data: row,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await ShopStaffCodeService.remove(
      req.params.shopId,
      req.params.staffCodeId,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: result.deactivated
        ? 'Staff code deactivated (referenced on bills)'
        : 'Staff code deleted successfully',
      data: result,
    });
  }),

  billingSummary: asyncHandler(async (req, res) => {
    const summary = await ShopStaffCodeService.getBillingSummary(req.params.shopId, req.user, {
      from_date: req.query.from_date,
      to_date: req.query.to_date,
    });
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Staff billing summary fetched successfully',
      data: summary,
    });
  }),
};

module.exports = ShopStaffCodeController;
