/**
 * Normalize product codes for inventory ↔ e-comm matching (variant-level).
 * Rules: trim + uppercase; canonicalize multi-variant suffix (34354-01 → 34354-1).
 */
const normalizeProductCode = (value) => {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return '';
  const match = s.match(/^([A-Z0-9]+)-(\d+)$/);
  if (match) {
    const baseToken = match[1];
    const seq = Number(match[2]);
    if (!Number.isFinite(seq)) return s;
    return `${baseToken}-${seq}`;
  }
  return s;
};

/**
 * Strip trailing -N variant suffix → base product code.
 */
const normalizeBaseProductCode = (value) => {
  const code = normalizeProductCode(value);
  const match = code.match(/^(.+)-(\d+)$/);
  if (match) return match[1];
  return code;
};

module.exports = {
  normalizeProductCode,
  normalizeBaseProductCode,
};
