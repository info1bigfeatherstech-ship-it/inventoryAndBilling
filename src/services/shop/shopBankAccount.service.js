const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const {
  assertValidIfsc,
  assertValidUpiId,
  formatBankAccountResponse,
  sortAccountsDefaultFirst,
} = require('../../utils/shopBank.utils');
const {
  assertShopBankReadAccess,
  assertShopBankWriteAccess,
} = require('../../utils/shopManageAccess.utils');

const BANK_ACCOUNT_SELECT = {
  bank_account_id: true,
  gst_config_id: true,
  account_holder_name: true,
  bank_name: true,
  branch_name: true,
  account_number: true,
  ifsc_code: true,
  upi_id: true,
  is_default: true,
  is_active: true,
  remarks: true,
  created_at: true,
  updated_at: true,
  gst_config: {
    select: {
      gst_config_id: true,
      shop_id: true,
      gst_number: true,
      legal_name: true,
      is_default: true,
      is_active: true,
    },
  },
};

const assertGstConfigForShop = async (gstConfigId, shopId, tx = prisma) => {
  const config = await tx.shopGstRegistration.findUnique({
    where: { gst_config_id: gstConfigId },
    select: { gst_config_id: true, shop_id: true, is_active: true },
  });
  if (!config || config.shop_id !== shopId) {
    throw new AppError('GST registration not found for this shop', 404, 'GST_CONFIG_NOT_FOUND');
  }
  if (!config.is_active) {
    throw new AppError('GST registration is inactive', 409, 'GST_CONFIG_INACTIVE');
  }
  return config;
};

const ensureDefaultGstConfig = async (shopId, tx = prisma) => {
  const existing = await tx.shopGstRegistration.findFirst({
    where: { shop_id: shopId, is_active: true },
    orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
  });
  if (existing) return existing;

  const shop = await tx.shop.findUnique({
    where: { shop_id: shopId },
    select: { shop_name: true },
  });
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');

  return tx.shopGstRegistration.create({
    data: {
      shop_id: shopId,
      gst_number: 'UNREGISTERED',
      legal_name: shop.shop_name,
      is_default: true,
      is_active: true,
      remarks: 'Auto-created for bank account and UPI billing',
    },
  });
};

const clearOtherDefaults = async (gstConfigId, exceptId, tx) => {
  await tx.shopBankAccount.updateMany({
    where: {
      gst_config_id: gstConfigId,
      is_active: true,
      ...(exceptId ? { bank_account_id: { not: exceptId } } : {}),
    },
    data: { is_default: false },
  });
};

const sanitizeBankPayload = (data, { isUpdate = false } = {}) => {
  const payload = {};

  if (data.account_holder_name != null) {
    payload.account_holder_name = String(data.account_holder_name).trim();
    if (!payload.account_holder_name) {
      throw new AppError('account_holder_name is required', 400, 'ACCOUNT_HOLDER_REQUIRED');
    }
  }

  if (data.bank_name != null) {
    payload.bank_name = String(data.bank_name).trim();
    if (!payload.bank_name) throw new AppError('bank_name is required', 400, 'BANK_NAME_REQUIRED');
  }

  if (data.branch_name !== undefined) {
    payload.branch_name = data.branch_name ? String(data.branch_name).trim() : null;
  }

  if (data.account_number != null) {
    const num = String(data.account_number).trim().replace(/\s/g, '');
    if (!/^\d{6,18}$/.test(num)) {
      throw new AppError('account_number must be 6–18 digits', 400, 'INVALID_ACCOUNT_NUMBER');
    }
    payload.account_number = num;
  } else if (!isUpdate) {
    throw new AppError('account_number is required', 400, 'ACCOUNT_NUMBER_REQUIRED');
  }

  if (data.ifsc_code != null) {
    payload.ifsc_code = assertValidIfsc(data.ifsc_code);
  } else if (!isUpdate) {
    throw new AppError('ifsc_code is required', 400, 'IFSC_REQUIRED');
  }

  if (data.upi_id !== undefined) {
    payload.upi_id = data.upi_id ? assertValidUpiId(data.upi_id) : null;
  }

  if (data.is_default != null) payload.is_default = Boolean(data.is_default);
  if (data.is_active != null) payload.is_active = Boolean(data.is_active);
  if (data.remarks !== undefined) payload.remarks = data.remarks ? String(data.remarks).trim() : null;

  return payload;
};

const ShopBankAccountService = {
  async listForShop(shopId, user, { active_only = true, upi_only = false } = {}) {
    const resolvedShopId = await assertShopBankReadAccess(shopId, user);

    const accounts = await prisma.shopBankAccount.findMany({
      where: {
        gst_config: { shop_id: resolvedShopId },
        ...(active_only ? { is_active: true } : {}),
        ...(upi_only ? { upi_id: { not: null } } : {}),
      },
      orderBy: [{ is_default: 'desc' }, { bank_name: 'asc' }],
      select: BANK_ACCOUNT_SELECT,
    });

    const formatted = sortAccountsDefaultFirst(accounts.map((row) => formatBankAccountResponse(row)));
    return { shop_id: resolvedShopId, accounts: formatted };
  },

  async getById(shopId, bankAccountId, user) {
    const resolvedShopId = await assertShopBankReadAccess(shopId, user);
    const row = await prisma.shopBankAccount.findFirst({
      where: {
        bank_account_id: bankAccountId,
        gst_config: { shop_id: resolvedShopId },
      },
      select: BANK_ACCOUNT_SELECT,
    });
    if (!row) throw new AppError('Bank account not found', 404, 'BANK_ACCOUNT_NOT_FOUND');
    return formatBankAccountResponse(row);
  },

  async create(shopId, data, user) {
    const resolvedShopId = await assertShopBankWriteAccess(shopId, user);
    const payload = sanitizeBankPayload(data);

    if (!payload.upi_id) {
      throw new AppError('upi_id is required for UPI billing', 400, 'UPI_ID_REQUIRED');
    }

    const row = await prisma.$transaction(async (tx) => {
      let gstConfigId = data.gst_config_id;
      if (gstConfigId) {
        await assertGstConfigForShop(gstConfigId, resolvedShopId, tx);
      } else {
        const config = await ensureDefaultGstConfig(resolvedShopId, tx);
        gstConfigId = config.gst_config_id;
      }

      const existingCount = await tx.shopBankAccount.count({
        where: { gst_config_id: gstConfigId, is_active: true },
      });
      const makeDefault = payload.is_default ?? existingCount === 0;

      if (makeDefault) {
        await clearOtherDefaults(gstConfigId, null, tx);
      }

      return tx.shopBankAccount.create({
        data: {
          gst_config_id: gstConfigId,
          account_holder_name: payload.account_holder_name,
          bank_name: payload.bank_name,
          branch_name: payload.branch_name ?? null,
          account_number: payload.account_number,
          ifsc_code: payload.ifsc_code,
          upi_id: payload.upi_id,
          is_default: makeDefault,
          is_active: true,
          remarks: payload.remarks ?? null,
        },
        select: BANK_ACCOUNT_SELECT,
      });
    });

    return formatBankAccountResponse(row);
  },

  async update(shopId, bankAccountId, data, user) {
    const resolvedShopId = await assertShopBankWriteAccess(shopId, user);

    const existing = await prisma.shopBankAccount.findFirst({
      where: {
        bank_account_id: bankAccountId,
        gst_config: { shop_id: resolvedShopId },
      },
      select: { bank_account_id: true, gst_config_id: true, is_active: true },
    });
    if (!existing) throw new AppError('Bank account not found', 404, 'BANK_ACCOUNT_NOT_FOUND');

    const payload = sanitizeBankPayload(data, { isUpdate: true });

    const row = await prisma.$transaction(async (tx) => {
      if (payload.is_default === true) {
        await clearOtherDefaults(existing.gst_config_id, bankAccountId, tx);
      }

      return tx.shopBankAccount.update({
        where: { bank_account_id: bankAccountId },
        data: payload,
        select: BANK_ACCOUNT_SELECT,
      });
    });

    return formatBankAccountResponse(row);
  },

  async remove(shopId, bankAccountId, user) {
    const resolvedShopId = await assertShopBankWriteAccess(shopId, user);

    const existing = await prisma.shopBankAccount.findFirst({
      where: {
        bank_account_id: bankAccountId,
        gst_config: { shop_id: resolvedShopId },
      },
      select: { bank_account_id: true, gst_config_id: true, is_default: true },
    });
    if (!existing) throw new AppError('Bank account not found', 404, 'BANK_ACCOUNT_NOT_FOUND');

    const billRefCount = await prisma.bill.count({
      where: { bank_account_id: bankAccountId, is_cancelled: false },
    });
    if (billRefCount > 0) {
      const row = await prisma.shopBankAccount.update({
        where: { bank_account_id: bankAccountId },
        data: { is_active: false, is_default: false },
        select: BANK_ACCOUNT_SELECT,
      });

      if (existing.is_default) {
        const next = await prisma.shopBankAccount.findFirst({
          where: {
            gst_config_id: existing.gst_config_id,
            is_active: true,
            bank_account_id: { not: bankAccountId },
          },
          orderBy: { created_at: 'asc' },
        });
        if (next) {
          await prisma.shopBankAccount.update({
            where: { bank_account_id: next.bank_account_id },
            data: { is_default: true },
          });
        }
      }

      return { deactivated: true, account: formatBankAccountResponse(row) };
    }

    await prisma.shopBankAccount.delete({ where: { bank_account_id: bankAccountId } });
    return { deactivated: false, account: null };
  },

  /**
   * Default active bank account for GST invoice PDF (when bill has no linked account).
   */
  async resolveDefaultForGstInvoice(shopId, gstConfigId = null) {
    const row = await prisma.shopBankAccount.findFirst({
      where: {
        is_active: true,
        gst_config: {
          shop_id: shopId,
          is_active: true,
          ...(gstConfigId ? { gst_config_id: gstConfigId } : {}),
        },
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      select: {
        bank_account_id: true,
        account_holder_name: true,
        bank_name: true,
        branch_name: true,
        account_number: true,
        ifsc_code: true,
        upi_id: true,
      },
    });
    return row || null;
  },

  /**
   * Validate bank account belongs to shop and is usable for UPI billing.
   */
  async assertBankAccountForBilling(bankAccountId, shopId, { requireUpi = true } = {}) {
    const row = await prisma.shopBankAccount.findFirst({
      where: {
        bank_account_id: bankAccountId,
        is_active: true,
        gst_config: { shop_id: shopId, is_active: true },
      },
      select: BANK_ACCOUNT_SELECT,
    });

    if (!row) {
      throw new AppError('Bank account not found for this shop', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }
    if (requireUpi && !row.upi_id) {
      throw new AppError('Selected bank account has no UPI ID configured', 400, 'UPI_ID_NOT_CONFIGURED');
    }
    return row;
  },
};

module.exports = ShopBankAccountService;
