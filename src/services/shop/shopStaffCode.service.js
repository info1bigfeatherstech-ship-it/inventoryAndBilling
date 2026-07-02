const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { roundMoney } = require('../../utils/billing.utils');
const {
  assertValidStaffCode,
  formatStaffCodeResponse,
} = require('../../utils/shopStaffCode.utils');
const {
  assertShopBankReadAccess,
  assertShopStaffWriteAccess,
} = require('../../utils/shopManageAccess.utils');

const STAFF_CODE_SELECT = {
  staff_code_id: true,
  shop_id: true,
  code: true,
  display_name: true,
  phone: true,
  is_active: true,
  remarks: true,
  created_at: true,
  updated_at: true,
};

const sanitizeStaffPayload = (data, { isUpdate = false } = {}) => {
  const payload = {};

  if (data.code != null) {
    payload.code = assertValidStaffCode(data.code);
  } else if (!isUpdate) {
    throw new AppError('code is required', 400, 'STAFF_CODE_REQUIRED');
  }

  if (data.display_name != null) {
    payload.display_name = String(data.display_name).trim();
    if (!payload.display_name) {
      throw new AppError('display_name is required', 400, 'DISPLAY_NAME_REQUIRED');
    }
  } else if (!isUpdate) {
    throw new AppError('display_name is required', 400, 'DISPLAY_NAME_REQUIRED');
  }

  if (data.phone !== undefined) {
    const phone = data.phone ? String(data.phone).trim().replace(/\D/g, '') : null;
    if (phone && phone.length !== 10) {
      throw new AppError('phone must be 10 digits when provided', 400, 'INVALID_PHONE');
    }
    payload.phone = phone;
  }

  if (data.is_active != null) payload.is_active = Boolean(data.is_active);
  if (data.remarks !== undefined) payload.remarks = data.remarks ? String(data.remarks).trim() : null;

  return payload;
};

const ShopStaffCodeService = {
  async listForShop(shopId, user, { active_only = true } = {}) {
    const resolvedShopId = await assertShopBankReadAccess(shopId, user);

    const rows = await prisma.shopStaffCode.findMany({
      where: {
        shop_id: resolvedShopId,
        ...(active_only ? { is_active: true } : {}),
      },
      orderBy: [{ code: 'asc' }],
      select: STAFF_CODE_SELECT,
    });

    return {
      shop_id: resolvedShopId,
      staff_codes: rows.map(formatStaffCodeResponse),
    };
  },

  async getById(shopId, staffCodeId, user) {
    const resolvedShopId = await assertShopBankReadAccess(shopId, user);
    const row = await prisma.shopStaffCode.findFirst({
      where: { staff_code_id: staffCodeId, shop_id: resolvedShopId },
      select: STAFF_CODE_SELECT,
    });
    if (!row) throw new AppError('Staff code not found', 404, 'STAFF_CODE_NOT_FOUND');
    return formatStaffCodeResponse(row);
  },

  async create(shopId, data, user) {
    const resolvedShopId = await assertShopStaffWriteAccess(shopId, user);
    const payload = sanitizeStaffPayload(data);

    const shop = await prisma.shop.findUnique({
      where: { shop_id: resolvedShopId },
      select: { is_active: true },
    });
    if (!shop?.is_active) throw new AppError('Shop is inactive', 409, 'SHOP_INACTIVE');

    try {
      const row = await prisma.shopStaffCode.create({
        data: {
          shop_id: resolvedShopId,
          code: payload.code,
          display_name: payload.display_name,
          phone: payload.phone ?? null,
          is_active: true,
          remarks: payload.remarks ?? null,
        },
        select: STAFF_CODE_SELECT,
      });
      return formatStaffCodeResponse(row);
    } catch (err) {
      if (err.code === 'P2002') {
        throw new AppError(`Staff code "${payload.code}" already exists for this shop`, 409, 'STAFF_CODE_DUPLICATE');
      }
      throw err;
    }
  },

  async update(shopId, staffCodeId, data, user) {
    const resolvedShopId = await assertShopStaffWriteAccess(shopId, user);

    const existing = await prisma.shopStaffCode.findFirst({
      where: { staff_code_id: staffCodeId, shop_id: resolvedShopId },
      select: { staff_code_id: true, code: true },
    });
    if (!existing) throw new AppError('Staff code not found', 404, 'STAFF_CODE_NOT_FOUND');

    const payload = sanitizeStaffPayload(data, { isUpdate: true });
    if (payload.code && payload.code !== existing.code) {
      throw new AppError(
        'Staff code value cannot be changed — reassign display name instead',
        409,
        'STAFF_CODE_IMMUTABLE'
      );
    }
    delete payload.code;

    const row = await prisma.shopStaffCode.update({
      where: { staff_code_id: staffCodeId },
      data: payload,
      select: STAFF_CODE_SELECT,
    });
    return formatStaffCodeResponse(row);
  },

  async remove(shopId, staffCodeId, user) {
    const resolvedShopId = await assertShopStaffWriteAccess(shopId, user);

    const existing = await prisma.shopStaffCode.findFirst({
      where: { staff_code_id: staffCodeId, shop_id: resolvedShopId },
      select: { staff_code_id: true },
    });
    if (!existing) throw new AppError('Staff code not found', 404, 'STAFF_CODE_NOT_FOUND');

    const billRefCount = await prisma.bill.count({
      where: { staff_code_id: staffCodeId, is_cancelled: false },
    });

    if (billRefCount > 0) {
      const row = await prisma.shopStaffCode.update({
        where: { staff_code_id: staffCodeId },
        data: { is_active: false },
        select: STAFF_CODE_SELECT,
      });
      return { deactivated: true, staff_code: formatStaffCodeResponse(row) };
    }

    await prisma.shopStaffCode.delete({ where: { staff_code_id: staffCodeId } });
    return { deactivated: false, staff_code: null };
  },

  async countActiveForShop(shopId) {
    return prisma.shopStaffCode.count({
      where: { shop_id: shopId, is_active: true },
    });
  },

  /**
   * Resolve staff code for billing and return immutable snapshot fields.
   */
  async resolveForBilling(staffCodeId, shopId) {
    const row = await prisma.shopStaffCode.findFirst({
      where: {
        staff_code_id: staffCodeId,
        shop_id: shopId,
        is_active: true,
      },
      select: STAFF_CODE_SELECT,
    });

    if (!row) {
      throw new AppError('Staff code not found or inactive for this shop', 404, 'STAFF_CODE_NOT_FOUND');
    }

    return {
      staff_code_id: row.staff_code_id,
      staff_code_value: row.code,
      staff_name_snapshot: row.display_name,
    };
  },

  async getBillingSummary(shopId, user, { from_date, to_date } = {}) {
    const resolvedShopId = await assertShopBankReadAccess(shopId, user);

    const end = to_date ? new Date(to_date) : new Date();
    const endExclusive = new Date(end);
    endExclusive.setDate(endExclusive.getDate() + 1);

    const start = from_date
      ? new Date(from_date)
      : new Date(end.getFullYear(), end.getMonth(), end.getDate());

    const bills = await prisma.bill.findMany({
      where: {
        shop_id: resolvedShopId,
        is_cancelled: false,
        created_at: { gte: start, lt: endExclusive },
        staff_code_value: { not: null },
      },
      select: {
        staff_code_value: true,
        staff_name_snapshot: true,
        total_amount: true,
        paid_amount: true,
      },
    });

    const map = new Map();
    for (const bill of bills) {
      const key = bill.staff_code_value;
      if (!map.has(key)) {
        map.set(key, {
          staff_code_value: bill.staff_code_value,
          staff_name_snapshot: bill.staff_name_snapshot,
          bill_count: 0,
          total_amount: 0,
          total_collected: 0,
        });
      }
      const agg = map.get(key);
      agg.bill_count += 1;
      agg.total_amount = roundMoney(agg.total_amount + bill.total_amount);
      agg.total_collected = roundMoney(agg.total_collected + bill.paid_amount);
    }

    const by_staff = Array.from(map.values()).sort((a, b) =>
      a.staff_code_value.localeCompare(b.staff_code_value)
    );

    return {
      shop_id: resolvedShopId,
      from_date: start.toISOString().slice(0, 10),
      to_date: end.toISOString().slice(0, 10),
      bill_count: bills.length,
      by_staff,
    };
  },
};

module.exports = ShopStaffCodeService;
