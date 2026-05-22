const asyncHandler = require('../../utils/asyncHandler.utils');
const ShopService = require('../../services/shop/shop.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const ShopController = {
  create: asyncHandler(async (req, res) => {
    const shop = await ShopService.createShop(req.body);
    return successResponse(res, req, { statusCode: 201, message: 'Shop created successfully', data: shop });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, shops } = await ShopService.listShops(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Shops fetched successfully',
      data: shops,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const shop = await ShopService.getShopById(req.params.shopId, req.user);
    return successResponse(res, req, { statusCode: 200, message: 'Shop fetched successfully', data: shop });
  }),

  update: asyncHandler(async (req, res) => {
    const shop = await ShopService.updateShop(req.params.shopId, req.body);
    return successResponse(res, req, { statusCode: 200, message: 'Shop updated successfully', data: shop });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await ShopService.softDeleteShop(req.params.shopId);
    return successResponse(res, req, {
      statusCode: 200,
      message: result.alreadyInactive ? 'Shop already inactive' : 'Shop deactivated successfully',
      data: { shop_id: req.params.shopId, is_active: false },
    });
  }),
};

module.exports = ShopController;
