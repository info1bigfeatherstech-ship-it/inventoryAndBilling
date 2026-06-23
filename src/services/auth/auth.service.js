const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { signAccessToken, signRefreshToken, verifyRefreshToken, decodeToken } = require('../../utils/jwt.utils');
const logger = require('../../utils/logger.utils');

const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const sanitizeUser = (user) => ({
  user_id: user.user_id,
  name: user.name,
  phone: user.phone,
  role: user.role,
  shop_id: user.shop_id,
  warehouse_id: user.warehouse_id,
  warehouse: user.warehouse || null,
  shop: user.shop || null,
});

const getRefreshTokenDelegate = (dbClient) => {
  if (dbClient?.refreshToken && typeof dbClient.refreshToken.create === 'function') {
    return dbClient.refreshToken;
  }

  throw new AppError(
    'Refresh token store is unavailable. Restart server and run "npx prisma generate".',
    500,
    'REFRESH_STORE_UNAVAILABLE'
  );
};

const issueSessionTokens = async ({ user, ipAddress, userAgent, tx = prisma, previousToken }) => {
  const refreshTokenDelegate = getRefreshTokenDelegate(tx);
  const refreshJti = crypto.randomUUID();
  const refreshToken = signRefreshToken({ userId: user.user_id, jti: refreshJti });
  const decodedRefresh = decodeToken(refreshToken);
  const refreshExpSeconds = decodedRefresh?.exp;

  if (!Number.isFinite(refreshExpSeconds)) {
    throw new AppError('Failed to issue refresh token', 500, 'REFRESH_ISSUE_FAILED');
  }

  const accessToken = signAccessToken({
    userId: user.user_id,
    role: user.role,
    shopId: user.shop_id,
    warehouseId: user.warehouse_id,
  });

  const newTokenData = {
    user_id: user.user_id,
    token_jti: refreshJti,
    token_hash: hashRefreshToken(refreshToken),
    expires_at: new Date(refreshExpSeconds * 1000),
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
    last_used_at: new Date(),
  };

  if (previousToken?.refresh_token_id) {
    await refreshTokenDelegate.update({
      where: { refresh_token_id: previousToken.refresh_token_id },
      data: {
        revoked_at: new Date(),
        revoked_reason: 'ROTATED',
        replaced_by_jti: refreshJti,
      },
    });
  }

  await refreshTokenDelegate.create({ data: newTokenData });

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    user: sanitizeUser(user),
  };
};

const findActiveRefreshRecord = async (decoded, tx = prisma) => {
  const refreshTokenDelegate = getRefreshTokenDelegate(tx);
  const record = await refreshTokenDelegate.findUnique({
    where: { token_jti: decoded.jti },
  });

  if (!record || record.user_id !== decoded.sub) {
    throw new AppError('Refresh token not recognized', 401, 'INVALID_REFRESH_TOKEN');
  }

  return record;
};

const AuthService = {
  async login({ phone, password }, context = {}) {
    logger.info('Auth login attempt', {
      requestId: context.requestId || null,
      phone,
      ip: context.ipAddress || null,
    });

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
        warehouse: {
          select: {
            warehouse_id: true,
            warehouse_code: true,
            warehouse_name: true,
            address: true,
            city: true,
            is_active: true,
          },
        },
        shop: {
          select: {
            shop_id: true,
            shop_code: true,
            shop_name: true,
            city: true,
            is_active: true,
            shop_type: true,
          },
        },
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

    return issueSessionTokens({
      user,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  },

  async refreshSession({ refreshToken, ipAddress, userAgent }) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new AppError('Refresh token is required', 401, 'REFRESH_TOKEN_REQUIRED');
    }

    const decoded = verifyRefreshToken(refreshToken);

    return prisma.$transaction(async (tx) => {
      const refreshTokenDelegate = getRefreshTokenDelegate(tx);
      const tokenRecord = await findActiveRefreshRecord(decoded, tx);

      if (tokenRecord.revoked_at) {
        await refreshTokenDelegate.updateMany({
          where: { user_id: tokenRecord.user_id, revoked_at: null },
          data: { revoked_at: new Date(), revoked_reason: 'REPLAY_DETECTED' },
        });
        throw new AppError('Refresh token replay detected', 401, 'TOKEN_REPLAY_DETECTED');
      }

      if (tokenRecord.expires_at.getTime() <= Date.now()) {
        await refreshTokenDelegate.update({
          where: { refresh_token_id: tokenRecord.refresh_token_id },
          data: { revoked_at: new Date(), revoked_reason: 'EXPIRED' },
        });
        throw new AppError('Refresh token expired', 401, 'REFRESH_TOKEN_EXPIRED');
      }

      const incomingHash = hashRefreshToken(refreshToken);
      if (incomingHash !== tokenRecord.token_hash) {
        await refreshTokenDelegate.updateMany({
          where: { user_id: tokenRecord.user_id, revoked_at: null },
          data: { revoked_at: new Date(), revoked_reason: 'HASH_MISMATCH' },
        });
        throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
      }

      const user = await tx.user.findUnique({
        where: { user_id: decoded.sub },
        select: {
          user_id: true,
          name: true,
          phone: true,
          role: true,
          is_active: true,
          shop_id: true,
          warehouse_id: true,
          warehouse: {
            select: {
              warehouse_id: true,
              warehouse_code: true,
              warehouse_name: true,
              address: true,
              city: true,
              is_active: true,
            },
          },
          shop: {
            select: {
              shop_id: true,
              shop_code: true,
              shop_name: true,
              city: true,
              is_active: true,
              shop_type: true,
            },
          },
        },
      });

      if (!user || !user.is_active) {
        throw new AppError('User is inactive or does not exist', 401, 'USER_INACTIVE');
      }

      await refreshTokenDelegate.update({
        where: { refresh_token_id: tokenRecord.refresh_token_id },
        data: { last_used_at: new Date() },
      });

      return issueSessionTokens({
        user,
        ipAddress,
        userAgent,
        tx,
        previousToken: tokenRecord,
      });
    });
  },

  async logout({ refreshToken }) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      return;
    }

    let decoded = null;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (_error) {
      return;
    }

    const refreshTokenDelegate = getRefreshTokenDelegate(prisma);
    await refreshTokenDelegate.updateMany({
      where: {
        token_jti: decoded.jti,
        user_id: decoded.sub,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
        revoked_reason: 'LOGOUT',
      },
    });
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
        warehouse: {
          select: {
            warehouse_id: true,
            warehouse_code: true,
            warehouse_name: true,
            address: true,
            city: true,
            manager_name: true,
            is_active: true,
          },
        },
        shop: {
          select: {
            shop_id: true,
            shop_code: true,
            shop_name: true,
            city: true,
            is_active: true,
            shop_type: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return user;
  },
};

module.exports = AuthService;
