const asyncHandler = require('../../utils/asyncHandler.utils');
const UserService = require('../../services/user/user.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const UserController = {
  create: asyncHandler(async (req, res) => {
    const user = await UserService.createUser(req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'User created successfully',
      data: user,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, users } = await UserService.listUsers(req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Users fetched successfully',
      data: users,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const user = await UserService.getUserById(req.params.userId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'User fetched successfully',
      data: user,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const user = await UserService.updateUser(req.params.userId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'User updated successfully',
      data: user,
    });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const result = await UserService.updateUserStatus(req.params.userId, req.body.is_active);
    return successResponse(res, req, {
      statusCode: 200,
      message: result.unchanged ? 'User status already set' : 'User status updated successfully',
      data: { user_id: req.params.userId, is_active: req.body.is_active },
    });
  }),

  resetPassword: asyncHandler(async (req, res) => {
    await UserService.resetUserPassword(req.params.userId, req.body.new_password);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'User password reset successfully',
      data: { user_id: req.params.userId },
    });
  }),
};

module.exports = UserController;
