/**
 * Global combo pricing (special-price based, variant.combo_eligible opt-in).
 *
 * Rules:
 * - Count eligible units (qty sum) in the same special_price group
 * - Apply floor(units / trigger_qty) combo sets
 * - Per-unit combo price = combo_price / trigger_qty (last unit in each set absorbs rounding)
 * - Non-eligible / leftover units keep special_price, OR optional normal_unit_price
 *   (used by franchise transfers where leftover settles at F.Price)
 */

const roundMoney = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const priceKey = (price) => roundMoney(price).toFixed(2);

const parseComboEligible = (value) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (value == null || value === '') return false;
  const s = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'no', 'n', '0'].includes(s)) return false;
  return false;
};

/**
 * @param {Array<{
 *   line_key: string,
 *   variant_id?: string,
 *   quantity: number,
 *   special_price: number,
 *   normal_unit_price?: number,
 *   combo_eligible?: boolean,
 * }>} lines
 * @param {Array<{
 *   combo_rule_id: string,
 *   special_price_group: number,
 *   trigger_qty: number,
 *   combo_price: number,
 *   is_active?: boolean,
 * }>} rules
 */
const applyComboPricingToLines = (lines, rules = []) => {
  const activeRules = (Array.isArray(rules) ? rules : []).filter(
    (r) => r && r.is_active !== false && Number(r.trigger_qty) >= 2 && Number(r.combo_price) > 0
  );

  const ruleByPrice = new Map();
  for (const rule of activeRules) {
    const key = priceKey(rule.special_price_group);
    if (!ruleByPrice.has(key)) ruleByPrice.set(key, rule);
  }

  const normalized = (Array.isArray(lines) ? lines : []).map((line, index) => {
    const qty = Math.max(0, Math.floor(Number(line.quantity) || 0));
    const special = roundMoney(line.special_price);
    const hasNormalOverride =
      line.normal_unit_price != null && Number.isFinite(Number(line.normal_unit_price));
    const normalUnitPrice = hasNormalOverride
      ? roundMoney(Number(line.normal_unit_price))
      : special;
    return {
      ...line,
      line_key: line.line_key != null ? String(line.line_key) : `line_${index}`,
      quantity: qty,
      special_price: special,
      normal_unit_price: normalUnitPrice,
      combo_eligible: parseComboEligible(line.combo_eligible),
    };
  });

  const unitQueueByPrice = new Map();
  for (const line of normalized) {
    if (!line.combo_eligible || line.quantity <= 0) continue;
    const key = priceKey(line.special_price);
    if (!ruleByPrice.has(key)) continue;
    if (!unitQueueByPrice.has(key)) unitQueueByPrice.set(key, []);
    const queue = unitQueueByPrice.get(key);
    for (let i = 0; i < line.quantity; i += 1) {
      queue.push(line.line_key);
    }
  }

  /** @type {Map<string, { comboUnits: number, normalUnits: number, comboRule: object|null, comboUnitPrices: number[] }>} */
  const allocation = new Map();
  for (const line of normalized) {
    allocation.set(line.line_key, {
      comboUnits: 0,
      normalUnits: line.quantity,
      comboRule: null,
      comboUnitPrices: [],
    });
  }

  for (const [priceGroupKey, queue] of unitQueueByPrice.entries()) {
    const rule = ruleByPrice.get(priceGroupKey);
    if (!rule) continue;
    const triggerQty = Math.floor(Number(rule.trigger_qty));
    const comboPrice = roundMoney(rule.combo_price);
    if (triggerQty < 2 || comboPrice <= 0) continue;

    const sets = Math.floor(queue.length / triggerQty);
    if (sets <= 0) continue;

    const comboUnitCount = sets * triggerQty;
    const baseUnit = roundMoney(comboPrice / triggerQty);

    const unitPrices = [];
    for (let s = 0; s < sets; s += 1) {
      let setSum = 0;
      for (let u = 0; u < triggerQty - 1; u += 1) {
        unitPrices.push(baseUnit);
        setSum = roundMoney(setSum + baseUnit);
      }
      unitPrices.push(roundMoney(comboPrice - setSum));
    }

    for (let i = 0; i < comboUnitCount; i += 1) {
      const lineKey = queue[i];
      const alloc = allocation.get(lineKey);
      if (!alloc) continue;
      alloc.comboUnits += 1;
      alloc.normalUnits = Math.max(0, alloc.normalUnits - 1);
      alloc.comboRule = rule;
      alloc.comboUnitPrices.push(unitPrices[i]);
    }
  }

  return normalized.map((line) => {
    const alloc = allocation.get(line.line_key) || {
      comboUnits: 0,
      normalUnits: line.quantity,
      comboRule: null,
      comboUnitPrices: [],
    };

    const comboTotal = roundMoney(
      (alloc.comboUnitPrices || []).reduce((s, p) => s + Number(p || 0), 0)
    );
    const normalTotal = roundMoney(alloc.normalUnits * line.normal_unit_price);
    const lineTotal = roundMoney(comboTotal + normalTotal);

    const comboApplied = alloc.comboUnits > 0;
    let unitPrice = line.normal_unit_price;
    let comboUnitPrice = null;

    if (comboApplied && line.quantity > 0) {
      unitPrice = roundMoney(lineTotal / line.quantity);
      comboUnitPrice =
        alloc.comboUnitPrices[0] != null ? Number(alloc.comboUnitPrices[0]) : unitPrice;
    }

    return {
      line_key: line.line_key,
      variant_id: line.variant_id,
      quantity: line.quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      special_price: line.special_price,
      normal_unit_price: line.normal_unit_price,
      combo_applied: comboApplied,
      combo_unit_price: comboUnitPrice,
      combo_rule_id: alloc.comboRule?.combo_rule_id || null,
      combo_units: alloc.comboUnits,
      normal_units: alloc.normalUnits,
    };
  });
};

module.exports = {
  roundMoney,
  priceKey,
  parseComboEligible,
  applyComboPricingToLines,
};
