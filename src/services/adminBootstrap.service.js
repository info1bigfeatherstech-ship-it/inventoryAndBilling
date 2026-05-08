const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma.utils');
const config = require('../config/index.config');
const logger = require('../utils/logger.utils');

const SALT_ROUNDS = 12;

const ensureSuperAdmin = async () => {
  const adminPhone = String(config.ADMIN_PHONE || '').trim();
  const adminPassword = String(config.ADMIN_PASSWORD || '').trim();

  if (!adminPhone || !adminPassword) {
    logger.warn('Super admin bootstrap skipped: ADMIN_PHONE or ADMIN_PASSWORD missing');
    return { status: 'skipped' };
  }

  const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);

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

  // If existing user isn't super admin, keep data safe and only log warning.
  if (existing.role !== 'SUPER_ADMIN') {
    logger.warn('ADMIN_PHONE belongs to non-super-admin user. Bootstrap skipped for safety.', {
      userId: existing.user_id,
      role: existing.role,
    });
    return { status: 'conflict' };
  }

  // Keep admin active and rotate hash when env password changes.
  await prisma.user.update({
    where: { user_id: existing.user_id },
    data: {
      is_active: true,
      password_hash: passwordHash,
    },
  });

  logger.info('Super admin verified/updated', { userId: existing.user_id, phone: adminPhone });
  return { status: 'updated' };
};

module.exports = {
  ensureSuperAdmin,
};

