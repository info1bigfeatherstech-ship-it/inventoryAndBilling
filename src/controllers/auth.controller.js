const asyncHandler = require('../utils/asyncHandler.utils');
const { successResponse } = require('../utils/response.utils');
const AuthService = require('../services/auth.service');

const AuthController = {
  login: asyncHandler(async (req, res) => {
    const result = await AuthService.login(req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Login successful',
      data: result,
    });
  }),

  me: asyncHandler(async (req, res) => {
    const profile = await AuthService.getMyProfile(req.user.userId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Profile fetched successfully',
      data: profile,
    });
  }),
};

module.exports = AuthController;

