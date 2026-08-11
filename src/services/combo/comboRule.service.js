const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const { roundMoney } = require('../../utils/comboPricing.utils');

const COMBO_RULE_SELECT = {
  combo_rule_id: true,
  name: true,
  special_price_group: true,
  trigger_qty: true,
  combo_price: true,
  is_active: true,
  created_at: true,
  updated_at: true,
};

const assertSuperAdmin = (user) => {
  if (!user || user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only SUPER_ADMIN can manage combo rules', 403, 'FORBIDDEN');
  }
};

const sanitizePayload = (data = {}, { partial = false } = {}) => {
  const out = {};

  if (!partial || Object.prototype.hasOwnProperty.call(data, 'name')) {
    const name = String(data.name || '').trim();
    if (!name) throw new AppError('name is required', 400, 'COMBO_NAME_REQUIRED');
    if (name.length > 120) throw new AppError('name must be at most 120 characters', 400, 'COMBO_NAME_TOO_LONG');
    out.name = name;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(data, 'special_price_group')) {
    const group = Number(data.special_price_group);
    if (!Number.isFinite(group) || group <= 0) {
      throw new AppError('special_price_group must be a positive number (special price)', 400, 'INVALID_PRICE_GROUP');
    }
    out.special_price_group = roundMoney(group);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(data, 'trigger_qty')) {
    const qty = Number(data.trigger_qty);
    if (!Number.isInteger(qty) || qty < 2) {
      throw new AppError('trigger_qty must be an integer >= 2', 400, 'INVALID_TRIGGER_QTY');
    }
    out.trigger_qty = qty;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(data, 'combo_price')) {
    const price = Number(data.combo_price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new AppError('combo_price must be a positive number', 400, 'INVALID_COMBO_PRICE');
    }
    out.combo_price = roundMoney(price);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'is_active')) {
    out.is_active = data.is_active === true || data.is_active === 'true' || data.is_active === 1;
  }

  return out;
};

const ComboRuleService = {
  async listRules(query = {}, user) {
    assertSuperAdmin(user);
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = {};
    if (query.is_active === true || query.is_active === 'true') where.is_active = true;
    if (query.is_active === false || query.is_active === 'false') where.is_active = false;

    const [total, rules] = await Promise.all([
      prisma.comboRule.count({ where }),
      prisma.comboRule.findMany({
        where,
        skip,
        take,
        orderBy: [{ is_active: 'desc' }, { special_price_group: 'asc' }, { created_at: 'desc' }],
        select: COMBO_RULE_SELECT,
      }),
    ]);

    return { total, page, limit, rules };
  },

  /** Active rules for billing (any authenticated shop/billing role). */
  async listActiveRulesForBilling() {
    return prisma.comboRule.findMany({
      where: { is_active: true },
      orderBy: [{ special_price_group: 'asc' }, { created_at: 'asc' }],
      select: COMBO_RULE_SELECT,
    });
  },

  async getRuleById(comboRuleId, user) {
    assertSuperAdmin(user);
    const rule = await prisma.comboRule.findUnique({
      where: { combo_rule_id: comboRuleId },
      select: COMBO_RULE_SELECT,
    });
    if (!rule) throw new AppError('Combo rule not found', 404, 'COMBO_RULE_NOT_FOUND');
    return rule;
  },

  async createRule(data, user) {
    assertSuperAdmin(user);
    const payload = sanitizePayload(data, { partial: false });
    if (!Object.prototype.hasOwnProperty.call(payload, 'is_active')) payload.is_active = true;

    return prisma.comboRule.create({
      data: payload,
      select: COMBO_RULE_SELECT,
    });
  },

  async updateRule(comboRuleId, data, user) {
    assertSuperAdmin(user);
    await this.getRuleById(comboRuleId, user);
    const payload = sanitizePayload(data, { partial: true });
    if (!Object.keys(payload).length) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    return prisma.comboRule.update({
      where: { combo_rule_id: comboRuleId },
      data: payload,
      select: COMBO_RULE_SELECT,
    });
  },

  async setActive(comboRuleId, isActive, user) {
    assertSuperAdmin(user);
    await this.getRuleById(comboRuleId, user);
    return prisma.comboRule.update({
      where: { combo_rule_id: comboRuleId },
      data: { is_active: Boolean(isActive) },
      select: COMBO_RULE_SELECT,
    });
  },

  async deleteRule(comboRuleId, user) {
    assertSuperAdmin(user);
    await this.getRuleById(comboRuleId, user);
    await prisma.comboRule.delete({ where: { combo_rule_id: comboRuleId } });
    return { deleted: true };
  },
};

module.exports = ComboRuleService;
