const jwt = require('jsonwebtoken');
const config = require('../config/index.config');
const { AppError } = require('../middlewares/error.middleware');

const signAccessToken = (payload, options = {}) => {
  const jwtPayload = {
    sub: payload.userId,
    role: payload.role,
    shopId: payload.shopId || null,
    warehouseId: payload.warehouseId || null,
  };

  return jwt.sign(jwtPayload, config.JWT_SECRET, {
    expiresIn: options.expiresIn || config.JWT_EXPIRES_IN,
  });
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED');
    }
    throw new AppError('Invalid access token', 401, 'INVALID_TOKEN');
  }
};

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
