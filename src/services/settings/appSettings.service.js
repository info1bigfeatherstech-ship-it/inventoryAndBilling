const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const {
  ALLOWED_FRANCHISE_MARKUP_PERCENTS,
  DEFAULT_FRANCHISE_MARKUP_PERCENT,
  resolveFranchiseMarkupPercent,
} = require('../../utils/franchisePrice.utils');

const SETTINGS_ID = 'default';

const getOrCreateSettings = async () => {
  let row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    row = await prisma.appSettings.create({
      data: {
        id: SETTINGS_ID,
        franchise_markup_percent: DEFAULT_FRANCHISE_MARKUP_PERCENT,
      },
    });
  }
  return row;
};

const AppSettingsService = {
  async getFranchiseMarkupPercent() {
    const row = await getOrCreateSettings();
    return resolveFranchiseMarkupPercent(row.franchise_markup_percent);
  },

  async getFranchiseSettings() {
    const row = await getOrCreateSettings();
    return {
      franchise_markup_percent: resolveFranchiseMarkupPercent(row.franchise_markup_percent),
      allowed_markup_percents: ALLOWED_FRANCHISE_MARKUP_PERCENTS,
      updated_at: row.updated_at,
    };
  },

  async updateFranchiseSettings({ franchise_markup_percent }, user) {
    if (user?.role !== 'SUPER_ADMIN') {
      throw new AppError('Only super admin can update franchise settings', 403, 'FORBIDDEN');
    }

    const updateData = { updated_by: user.userId };

    if (franchise_markup_percent != null) {
      const pct = Number(franchise_markup_percent);
      if (!ALLOWED_FRANCHISE_MARKUP_PERCENTS.includes(pct)) {
        throw new AppError(
          `franchise_markup_percent must be one of: ${ALLOWED_FRANCHISE_MARKUP_PERCENTS.join(', ')}`,
          400,
          'INVALID_FRANCHISE_MARKUP'
        );
      }
      updateData.franchise_markup_percent = pct;
    }

    const row = await prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        franchise_markup_percent: updateData.franchise_markup_percent ?? DEFAULT_FRANCHISE_MARKUP_PERCENT,
        ...updateData,
      },
      update: updateData,
    });

    return {
      franchise_markup_percent: row.franchise_markup_percent,
      allowed_markup_percents: ALLOWED_FRANCHISE_MARKUP_PERCENTS,
      updated_at: row.updated_at,
    };
  },
};

module.exports = AppSettingsService;
