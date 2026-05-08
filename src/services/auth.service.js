const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma.utils');
const { AppError } = require('../middlewares/error.middleware');
const { signAccessToken } = require('../utils/jwt.utils');

const AuthService = {
  async login({ phone, password }) {
    const user = await prisma.user.findUnique({
      where: { phone },
      select: {
        user_id: true,
        name: true,
        phone: true,
        role: true,
        is_active: true,
        shop_id: true,
        warehouse_id: true,
        password_hash: true,
      },
    });

    if (!user || !user.password_hash) {
      throw new AppError('Invalid phone or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.is_active) {
      throw new AppError('User account is inactive', 401, 'USER_INACTIVE');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new AppError('Invalid phone or password', 401, 'INVALID_CREDENTIALS');
    }

    const accessToken = signAccessToken({
      userId: user.user_id,
      role: user.role,
      shopId: user.shop_id,
      warehouseId: user.warehouse_id,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        user_id: user.user_id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        shop_id: user.shop_id,
        warehouse_id: user.warehouse_id,
      },
    };
  },

  async getMyProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        name: true,
        phone: true,
        role: true,
        is_active: true,
        shop_id: true,
        warehouse_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return user;
  },
};

module.exports = AuthService;

