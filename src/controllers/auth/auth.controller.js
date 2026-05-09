const asyncHandler = require('../../utils/asyncHandler.utils');
const { successResponse } = require('../../utils/response.utils');
const AuthService = require('../../services/auth/auth.service');
const { REFRESH_COOKIE_NAME, getRefreshCookieOptions } = require('../../utils/authCookies.utils');
const logger = require('../../utils/logger.utils');

const extractClientContext = (req) => ({
  ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
  userAgent: req.get('user-agent') || null,
  requestId: req.id || null,
});

const AuthController = {
  login: asyncHandler(async (req, res) => {
    logger.info('Auth login request received', { requestId: req.id, route: req.originalUrl });
    const result = await AuthService.login(req.body, extractClientContext(req));
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions());

    const { refreshToken, ...responsePayload } = result;
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Login successful',
      data: responsePayload,
    });
  }),

  refresh: asyncHandler(async (req, res) => {
    logger.info('Auth refresh request received', { requestId: req.id, route: req.originalUrl });
    const incomingRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const result = await AuthService.refreshSession({
      refreshToken: incomingRefreshToken,
      ...extractClientContext(req),
    });
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions());

    const { refreshToken, ...responsePayload } = result;
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Token refreshed successfully',
      data: responsePayload,
    });
  }),

  logout: asyncHandler(async (req, res) => {
    logger.info('Auth logout request received', { requestId: req.id, route: req.originalUrl });
    const incomingRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    await AuthService.logout({ refreshToken: incomingRefreshToken });
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());

    return successResponse(res, req, {
      statusCode: 200,
      message: 'Logout successful',
      data: null,
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
