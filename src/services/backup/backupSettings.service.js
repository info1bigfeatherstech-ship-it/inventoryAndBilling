const prisma = require('../../utils/prisma.utils');
const { DEFAULT_CLIENT_SETTINGS } = require('./backup.constants');

const pickSettingsFields = (row) => ({
  auto_backup_enabled: row.auto_backup_enabled,
  auto_backup_frequency: row.auto_backup_frequency,
  auto_backup_time: row.auto_backup_time,
  retention_days: row.retention_days,
  auto_delete_old_backups: row.auto_delete_old_backups,
  email_on_success: row.email_on_success,
  email_on_failure: row.email_on_failure,
  email_on_late: row.email_on_late,
  include_bills: row.include_bills,
  include_customers: row.include_customers,
  include_products: row.include_products,
  include_stock: row.include_stock,
  include_staff_codes: row.include_staff_codes,
  include_settings: row.include_settings,
  compression_level: row.compression_level,
  encrypt_backup: row.encrypt_backup,
});

const getOrCreateSettings = async (userId) => {
  let settings = await prisma.backupClientSettings.findUnique({
    where: { user_id: userId },
  });

  if (!settings) {
    settings = await prisma.backupClientSettings.create({
      data: {
        user_id: userId,
        ...DEFAULT_CLIENT_SETTINGS,
      },
    });
  }

  return pickSettingsFields(settings);
};

const updateSettings = async (userId, payload) => {
  const settings = await prisma.backupClientSettings.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      ...DEFAULT_CLIENT_SETTINGS,
      ...payload,
    },
    update: payload,
  });

  return pickSettingsFields(settings);
};

module.exports = {
  getOrCreateSettings,
  updateSettings,
};
