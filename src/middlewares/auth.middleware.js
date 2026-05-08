const prisma = require('../utils/prisma.utils');
const { AppError } = require('./error.middleware');
const { verifyAccessToken } = require('../utils/jwt.utils');

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
};

const requireAuth = async (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) {
    return next(new AppError('Authorization token is required', 401, 'AUTH_REQUIRED'));
  }

  const decoded = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { user_id: decoded.sub },
    select: {
      user_id: true,
      role: true,
      is_active: true,
      shop_id: true,
      warehouse_id: true,
      name: true,
      phone: true,
    },
  });

  if (!user || !user.is_active) {
    return next(new AppError('User is inactive or does not exist', 401, 'USER_INACTIVE'));
  }

  req.user = {
    userId: user.user_id,
    role: user.role,
    shopId: user.shop_id,
    warehouseId: user.warehouse_id,
    name: user.name,
    phone: user.phone,
  };

  return next();
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'AUTH_REQUIRED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }

    return next();
  };
};

module.exports = {
  requireAuth,
  authorizeRoles,
};
