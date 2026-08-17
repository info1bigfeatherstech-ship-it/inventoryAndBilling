/**
 * Today's Deal / Sale overlay helpers.
 * Sale never mutates ProductVariant.special_price. Evaluate live status at read time.
 */

const { roundMoney, priceKey } = require('./comboPricing.utils');
const { AppError } = require('../middlewares/error.middleware');

const MIN_POSITIVE_SALE = 0.01;

const isMissingSaleDealTable = (err) => {
  const code = err?.code;
  if (code === 'P2021' || code === 'P2022') return true;
  const msg = String(err?.message || '');
  return (
    /sale_deals/i.test(msg) &&
    (/does not exist/i.test(msg) || /The table `[^`]*sale_deals`/i.test(msg))
  );
};

const isLiveSaleDeal = (deal, now = new Date()) => {
  if (!deal || deal.is_active === false) return false;
  const price = Number(deal.sale_price);
  if (!Number.isFinite(price) || price <= 0) return false;
  if (deal.expires_at == null) return true;
  const expires = deal.expires_at instanceof Date ? deal.expires_at : new Date(deal.expires_at);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() >= now.getTime();
};

const comboUnitPriceFromRule = (rule) => {
  if (!rule) return null;
  const triggerQty = Math.floor(Number(rule.trigger_qty));
  const comboPrice = Number(rule.combo_price);
  if (triggerQty < 2 || !Number.isFinite(comboPrice) || comboPrice <= 0) return null;
  return roundMoney(comboPrice / triggerQty);
};

const findMatchingComboRule = (variant, rules = []) => {
  if (!variant || variant.combo_eligible !== true) return null;
  const special = roundMoney(Number(variant.special_price) || 0);
  if (!(special > 0)) return null;
  const key = priceKey(special);
  const active = Array.isArray(rules) ? rules : [];
  return (
    active.find((rule) => {
      if (!rule || rule.is_active === false) return false;
      if (Number(rule.trigger_qty) < 2 || Number(rule.combo_price) <= 0) return false;
      const group = roundMoney(Number(rule.special_price_group) || 0);
      return priceKey(group) === key;
    }) || null
  );
};

/**
 * Band: 0 < sale_price ≤ special_price, and sale_price ≤ MRP.
 * Combo SKUs also: round(combo_price / trigger_qty, 2) ≤ sale_price ≤ special_price.
 */
const resolveSalePriceBand = (variant, comboRules = []) => {
  const special = roundMoney(Number(variant?.special_price) || 0);
  const mrp = roundMoney(Number(variant?.mrp) || 0);
  const maxPrice = roundMoney(Math.min(special, mrp > 0 ? mrp : special));
  const comboRule = findMatchingComboRule(variant, comboRules);
  const comboUnit = comboUnitPriceFromRule(comboRule);
  const minPrice = comboUnit != null && comboUnit > 0 ? comboUnit : MIN_POSITIVE_SALE;
  return {
    special,
    mrp,
    min_sale_price: minPrice,
    max_sale_price: maxPrice,
    combo_rule_id: comboRule?.combo_rule_id || null,
    combo_unit_price: comboUnit,
    combo_trigger_qty: comboRule ? Number(comboRule.trigger_qty) : null,
    combo_price: comboRule != null ? roundMoney(Number(comboRule.combo_price)) : null,
  };
};

const validateSalePriceAgainstCatalog = (variant, salePrice, comboRules = []) => {
  const sale = roundMoney(Number(salePrice));
  if (!Number.isFinite(sale) || !(sale > 0)) {
    throw new AppError('sale_price must be greater than 0', 400, 'INVALID_SALE_PRICE');
  }

  const band = resolveSalePriceBand(variant, comboRules);
  if (!(band.special > 0)) {
    throw new AppError('Variant special price must be greater than 0 before a sale can be set', 400, 'INVALID_SPECIAL_PRICE');
  }
  if (sale > band.special) {
    throw new AppError(
      `Sale price cannot exceed special price (₹${band.special.toFixed(2)})`,
      400,
      'SALE_PRICE_ABOVE_SPECIAL'
    );
  }
  if (band.mrp > 0 && sale > band.mrp) {
    throw new AppError(
      `Sale price cannot exceed MRP (₹${band.mrp.toFixed(2)})`,
      400,
      'SALE_PRICE_ABOVE_MRP'
    );
  }
  if (band.combo_unit_price != null && sale < band.combo_unit_price) {
    throw new AppError(
      `Sale price cannot be below the combo unit (₹${band.combo_unit_price.toFixed(2)}). Combo SKUs must stay between combo unit and special.`,
      400,
      'SALE_PRICE_BELOW_COMBO_UNIT'
    );
  }
  return sale;
};

const parseExpiresAt = (value, { required = false } = {}) => {
  if (value == null || value === '') {
    if (required) throw new AppError('expires_at is required', 400, 'EXPIRES_AT_REQUIRED');
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('expires_at must be a valid date/time', 400, 'INVALID_EXPIRES_AT');
  }
  return date;
};

const applySaleOverlayToVariant = (variant, deal, now = new Date()) => {
  if (!variant || typeof variant !== 'object') return variant;
  const live = isLiveSaleDeal(deal, now);
  if (live) {
    const salePrice = roundMoney(Number(deal.sale_price));
    variant.on_sale = true;
    variant.sale_deal_id = deal.sale_deal_id;
    variant.sale_price = salePrice;
    variant.sale_expires_at = deal.expires_at || null;
    variant.effective_special_price = salePrice;
    variant.combo_paused_for_sale = true;
  } else {
    variant.on_sale = false;
    variant.sale_deal_id = null;
    variant.sale_price = null;
    variant.sale_expires_at = null;
    const catalog = Number(variant.special_price);
    variant.effective_special_price = Number.isFinite(catalog) ? roundMoney(catalog) : variant.special_price;
    variant.combo_paused_for_sale = false;
  }
  return variant;
};

const applySaleOverlayToPayload = (payload, deal, now = new Date()) =>
  applySaleOverlayToVariant(payload, deal, now);

const collectVariantsFromRecords = (records = []) => {
  const variants = [];
  const list = Array.isArray(records) ? records : records ? [records] : [];
  for (const rec of list) {
    if (rec?.variant) variants.push(rec.variant);
    if (Array.isArray(rec?.items)) {
      for (const item of rec.items) {
        if (item?.variant) variants.push(item.variant);
      }
    }
  }
  return variants;
};

module.exports = {
  MIN_POSITIVE_SALE,
  isMissingSaleDealTable,
  isLiveSaleDeal,
  comboUnitPriceFromRule,
  findMatchingComboRule,
  resolveSalePriceBand,
  validateSalePriceAgainstCatalog,
  parseExpiresAt,
  applySaleOverlayToVariant,
  applySaleOverlayToPayload,
  collectVariantsFromRecords,
};
