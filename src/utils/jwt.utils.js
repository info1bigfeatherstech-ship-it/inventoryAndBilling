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

const signRefreshToken = (payload, options = {}) => {
  const jwtPayload = {
    sub: payload.userId,
    type: 'refresh',
    jti: payload.jti,
  };

  return jwt.sign(jwtPayload, config.JWT_REFRESH_SECRET, {
    expiresIn: options.expiresIn || config.JWT_REFRESH_EXPIRES_IN,
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

const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh' || !decoded.jti || !decoded.sub) {
      throw new AppError('Malformed refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
    return decoded;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Refresh token expired', 401, 'REFRESH_TOKEN_EXPIRED');
    }
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }
};

const decodeToken = (token) => jwt.decode(token);

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  decodeToken,
};
