const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const {
  ALLOWED_FRANCHISE_MARKUP_PERCENTS,
  DEFAULT_FRANCHISE_MARKUP_PERCENT,
  resolveFranchiseMarkupPercent,
} = require('../../utils/franchisePrice.utils');
const { normalizeStateCode, stateCodeFromGstin } = require('../../utils/billing.utils');

const SETTINGS_ID = 'default';

const ONLINE_WAREHOUSE_SELECT = {
  warehouse_id: true,
  warehouse_code: true,
  warehouse_name: true,
  city: true,
  is_active: true,
};

const trimOrNull = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
};

const formatCompanyInvoiceSettings = (row) => ({
  transfer_invoice_legal_name: row.transfer_invoice_legal_name ?? null,
  transfer_invoice_gstin: row.transfer_invoice_gstin ?? null,
  transfer_invoice_state_code: row.transfer_invoice_state_code ?? null,
  transfer_invoice_address: row.transfer_invoice_address ?? null,
  transfer_invoice_city: row.transfer_invoice_city ?? null,
  transfer_invoice_phone: row.transfer_invoice_phone ?? null,
  transfer_invoice_email: row.transfer_invoice_email ?? null,
  updated_at: row.updated_at,
});

const getOrCreateSettings = async () => {
  let row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    include: { online_warehouse: { select: ONLINE_WAREHOUSE_SELECT } },
  });
  if (!row) {
    row = await prisma.appSettings.create({
      data: {
        id: SETTINGS_ID,
        franchise_markup_percent: DEFAULT_FRANCHISE_MARKUP_PERCENT,
      },
      include: { online_warehouse: { select: ONLINE_WAREHOUSE_SELECT } },
    });
  }
  return row;
};

const formatOnlineWarehouseSettings = (row) => ({
  online_warehouse_id: row.online_warehouse_id ?? null,
  online_warehouse: row.online_warehouse
    ? {
        warehouse_id: row.online_warehouse.warehouse_id,
        warehouse_code: row.online_warehouse.warehouse_code,
        warehouse_name: row.online_warehouse.warehouse_name,
        city: row.online_warehouse.city,
        is_active: row.online_warehouse.is_active,
      }
    : null,
  /** Optional env override wins when set (deploy-time force). */
  env_override_active: Boolean(process.env.ONLINE_WAREHOUSE_ID?.trim()),
  updated_at: row.updated_at,
});

/**
 * Resolve the warehouse used for e-comm / wholesale stock.
 * Priority: ONLINE_WAREHOUSE_ID env → AppSettings.online_warehouse_id
 */
const resolveOnlineWarehouseId = async () => {
  const envId = process.env.ONLINE_WAREHOUSE_ID?.trim();
  if (envId) {
    const wh = await prisma.warehouse.findUnique({
      where: { warehouse_id: envId },
      select: { warehouse_id: true, is_active: true },
    });
    if (!wh) {
      throw new AppError(
        'ONLINE_WAREHOUSE_ID env points to a missing warehouse',
        500,
        'ONLINE_WAREHOUSE_INVALID'
      );
    }
    if (!wh.is_active) {
      throw new AppError(
        'ONLINE_WAREHOUSE_ID env points to an inactive warehouse',
        409,
        'ONLINE_WAREHOUSE_INACTIVE'
      );
    }
    return wh.warehouse_id;
  }

  const row = await getOrCreateSettings();
  if (!row.online_warehouse_id) {
    throw new AppError(
      'Online fulfillment warehouse is not configured. Set it in Settings → Online Stock.',
      409,
      'ONLINE_WAREHOUSE_NOT_CONFIGURED'
    );
  }

  const wh = row.online_warehouse;
  if (!wh || !wh.is_active) {
    throw new AppError(
      'Configured online fulfillment warehouse is missing or inactive',
      409,
      'ONLINE_WAREHOUSE_INACTIVE'
    );
  }

  return row.online_warehouse_id;
};

/**
 * Company legal identity for stock-transfer bills (all warehouses share this).
 * Does not mutate warehouse rows.
 */
const getCompanyInvoiceIdentity = async () => {
  const row = await getOrCreateSettings();
  const gstin = trimOrNull(row.transfer_invoice_gstin)?.toUpperCase() || null;
  const legalName = trimOrNull(row.transfer_invoice_legal_name);
  const stateFromField = normalizeStateCode(row.transfer_invoice_state_code);
  const stateCode = stateFromField || stateCodeFromGstin(gstin) || null;

  return {
    legal_name: legalName,
    gstin,
    state_code: stateCode,
    address: trimOrNull(row.transfer_invoice_address),
    city: trimOrNull(row.transfer_invoice_city),
    phone: trimOrNull(row.transfer_invoice_phone),
    email: trimOrNull(row.transfer_invoice_email),
  };
};

const assertCompanyGstForTransferInvoice = async () => {
  const company = await getCompanyInvoiceIdentity();
  if (!company.gstin || company.gstin.length < 15) {
    throw new AppError(
      'GST transfer bill requires company GSTIN. Set it in Settings → Company Details (Super Admin).',
      409,
      'COMPANY_GSTIN_NOT_CONFIGURED'
    );
  }
  if (!company.legal_name) {
    throw new AppError(
      'GST transfer bill requires company legal name. Set it in Settings → Company Details (Super Admin).',
      409,
      'COMPANY_LEGAL_NAME_NOT_CONFIGURED'
    );
  }
  return company;
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

  async getOnlineStockSettings() {
    const row = await getOrCreateSettings();
    return formatOnlineWarehouseSettings(row);
  },

  async updateOnlineStockSettings({ online_warehouse_id }, user) {
    if (user?.role !== 'SUPER_ADMIN') {
      throw new AppError('Only super admin can update online stock settings', 403, 'FORBIDDEN');
    }

    const updateData = { updated_by: user.userId };

    if (online_warehouse_id === null || online_warehouse_id === '') {
      updateData.online_warehouse_id = null;
    } else if (online_warehouse_id != null) {
      const wh = await prisma.warehouse.findUnique({
        where: { warehouse_id: String(online_warehouse_id) },
        select: { warehouse_id: true, is_active: true },
      });
      if (!wh) {
        throw new AppError('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
      }
      if (!wh.is_active) {
        throw new AppError('Cannot select an inactive warehouse', 409, 'WAREHOUSE_INACTIVE');
      }
      updateData.online_warehouse_id = wh.warehouse_id;
    }

    const row = await prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        franchise_markup_percent: DEFAULT_FRANCHISE_MARKUP_PERCENT,
        ...updateData,
      },
      update: updateData,
      include: { online_warehouse: { select: ONLINE_WAREHOUSE_SELECT } },
    });

    return formatOnlineWarehouseSettings(row);
  },

  async getCompanyInvoiceSettings() {
    const row = await getOrCreateSettings();
    return formatCompanyInvoiceSettings(row);
  },

  async updateCompanyInvoiceSettings(payload = {}, user) {
    if (user?.role !== 'SUPER_ADMIN') {
      throw new AppError('Only super admin can update company details', 403, 'FORBIDDEN');
    }

    const updateData = { updated_by: user.userId };
    const fields = [
      'transfer_invoice_legal_name',
      'transfer_invoice_gstin',
      'transfer_invoice_state_code',
      'transfer_invoice_address',
      'transfer_invoice_city',
      'transfer_invoice_phone',
      'transfer_invoice_email',
    ];

    for (const key of fields) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      let value = trimOrNull(payload[key]);
      if (key === 'transfer_invoice_gstin' && value) {
        value = value.toUpperCase();
        if (!/^[0-9A-Z]{15}$/.test(value)) {
          throw new AppError('GSTIN must be a valid 15-character GSTIN', 400, 'INVALID_GSTIN');
        }
      }
      if (key === 'transfer_invoice_state_code' && value) {
        value = normalizeStateCode(value);
        if (!value) {
          throw new AppError('state_code must be a 2-digit GST state code', 400, 'INVALID_STATE_CODE');
        }
      }
      if (key === 'transfer_invoice_email' && value) {
        // Practical email check (optional field — blank clears to null).
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 120) {
          throw new AppError('Company email must be a valid email address', 400, 'INVALID_EMAIL');
        }
        value = value.toLowerCase();
      }
      updateData[key] = value;
    }

    if (
      updateData.transfer_invoice_gstin &&
      !updateData.transfer_invoice_state_code &&
      !Object.prototype.hasOwnProperty.call(payload, 'transfer_invoice_state_code')
    ) {
      const derived = stateCodeFromGstin(updateData.transfer_invoice_gstin);
      if (derived) updateData.transfer_invoice_state_code = derived;
    }

    const row = await prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        franchise_markup_percent: DEFAULT_FRANCHISE_MARKUP_PERCENT,
        ...updateData,
      },
      update: updateData,
    });

    return formatCompanyInvoiceSettings(row);
  },

  resolveOnlineWarehouseId,
  getCompanyInvoiceIdentity,
  assertCompanyGstForTransferInvoice,
};

module.exports = AppSettingsService;
