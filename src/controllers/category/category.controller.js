const asyncHandler = require('../../utils/asyncHandler.utils');
const CategoryService = require('../../services/category/category.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const CategoryController = {
  create: asyncHandler(async (req, res) => {
    const category = await CategoryService.createCategory(req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Category created successfully',
      data: category,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, categories } = await CategoryService.listCategories(req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Categories fetched successfully',
      data: categories,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const category = await CategoryService.getCategoryById(req.params.categoryId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Category fetched successfully',
      data: category,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const category = await CategoryService.updateCategory(req.params.categoryId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Category updated successfully',
      data: category,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await CategoryService.softDeleteCategory(req.params.categoryId);
    return successResponse(res, req, {
      statusCode: 200,
      message: result.alreadyInactive ? 'Category already inactive' : 'Category deactivated successfully',
      data: { category_id: req.params.categoryId, is_active: false },
    });
  }),
};

module.exports = CategoryController;
