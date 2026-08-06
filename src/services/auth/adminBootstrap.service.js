const bcrypt = require('bcryptjs');
const prisma = require('../../utils/prisma.utils');
const config = require('../../config/index.config');
const logger = require('../../utils/logger.utils');

const SALT_ROUNDS = 12;

/**
 * Ensure SUPER_ADMIN exists for ADMIN_PHONE.
 *
 * Production-safe password rules:
 * - New admin: hash ADMIN_PASSWORD and create once.
 * - Existing admin: never overwrite password on normal restart/deploy
 *   (so UI password changes persist).
 * - Optional: ADMIN_FORCE_PASSWORD_RESET=true to intentionally reset from env.
 * - Recovery: if password_hash is null/empty and ADMIN_PASSWORD is set, set it once.
 */
const ensureSuperAdmin = async () => {
  const adminPhone = String(config.ADMIN_PHONE || '').trim();
  const adminPassword = String(config.ADMIN_PASSWORD || '').trim();
  const forcePasswordReset = Boolean(config.ADMIN_FORCE_PASSWORD_RESET);

  if (!adminPhone) {
    logger.warn('Super admin bootstrap skipped: ADMIN_PHONE missing');
    return { status: 'skipped' };
  }

  const existing = await prisma.user.findUnique({
    where: { phone: adminPhone },
    select: {
      user_id: true,
      role: true,
      is_active: true,
      password_hash: true,
    },
  });

  if (!existing) {
    if (!adminPassword) {
      logger.warn('Super admin bootstrap skipped: ADMIN_PASSWORD missing (required to create admin)');
      return { status: 'skipped' };
    }

    const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    const created = await prisma.user.create({
      data: {
        name: config.ADMIN_NAME,
        phone: adminPhone,
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        is_active: true,
      },
      select: {
        user_id: true,
        phone: true,
        role: true,
      },
    });

    logger.info('Super admin created successfully', {
      userId: created.user_id,
      phone: created.phone,
    });
    return { status: 'created', user: created };
  }

  if (existing.role !== 'SUPER_ADMIN') {
    logger.warn('ADMIN_PHONE belongs to non-super-admin user. Bootstrap skipped for safety.', {
      userId: existing.user_id,
      role: existing.role,
    });
    return { status: 'conflict' };
  }

  const updateData = {};
  if (!existing.is_active) {
    updateData.is_active = true;
  }

  const missingPassword = !existing.password_hash || !String(existing.password_hash).trim();
  const shouldSetPassword = forcePasswordReset || missingPassword;

  if (shouldSetPassword) {
    if (!adminPassword) {
      logger.warn('Super admin password update skipped: ADMIN_PASSWORD missing', {
        userId: existing.user_id,
        forcePasswordReset,
        missingPassword,
      });
    } else {
      updateData.password_hash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    }
  }

  if (!Object.keys(updateData).length) {
    logger.info('Super admin verified (password unchanged)', {
      userId: existing.user_id,
      phone: adminPhone,
    });
    return { status: 'verified' };
  }

  await prisma.user.update({
    where: { user_id: existing.user_id },
    data: updateData,
  });

  logger.info('Super admin updated', {
    userId: existing.user_id,
    phone: adminPhone,
    reactivated: Boolean(updateData.is_active),
    passwordUpdated: Boolean(updateData.password_hash),
    forcePasswordReset,
    missingPassword,
  });

  return {
    status: 'updated',
    passwordUpdated: Boolean(updateData.password_hash),
  };
};

module.exports = {
  ensureSuperAdmin,
};
