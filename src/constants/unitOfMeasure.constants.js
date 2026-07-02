const { AppError } = require('../middlewares/error.middleware');

/** Canonical unit-of-measure values for product listing / bulk upload. */
const UNIT_OF_MEASURE_VALUES = [
  'Pcs',
  'Pair',
  'Set',
  'Pack',
  'Packet',
  'Box',
  'Carton',
  'Dozen',
  'Roll',
  'Bundle',
  'Bag',
  'Bottle',
  'Can',
  'Jar',
  'Tube',
  'Strip',
  'Sheet',
  'Ream',
  'Meter',
  'Foot',
  'Inch',
  'Gram',
  'Kilogram',
  'Milliliter',
  'Liter',
  'Unit',
  'Case',
  'Lot',
];

const UNIT_OF_MEASURE_DESCRIPTIONS = {
  Pcs: 'Pieces — default for most items',
  Pair: 'Pair (footwear, gloves, etc.)',
  Set: 'Set / kit',
  Pack: 'Pack',
  Packet: 'Packet',
  Box: 'Box',
  Carton: 'Carton',
  Dozen: 'Dozen (12 units)',
  Roll: 'Roll',
  Bundle: 'Bundle',
  Bag: 'Bag',
  Bottle: 'Bottle',
  Can: 'Can',
  Jar: 'Jar',
  Tube: 'Tube',
  Strip: 'Strip',
  Sheet: 'Sheet',
  Ream: 'Ream',
  Meter: 'Metres',
  Foot: 'Foot',
  Inch: 'Inch',
  Gram: 'Grams',
  Kilogram: 'Kilograms',
  Milliliter: 'Millilitres',
  Liter: 'Litres',
  Unit: 'Unit',
  Case: 'Case',
  Lot: 'Lot',
};

/** Legacy abbreviations accepted on import; normalized to canonical values. */
const UNIT_OF_MEASURE_LEGACY_ALIASES = {
  PCS: 'Pcs',
  PAIR: 'Pair',
  SET: 'Set',
  PACK: 'Pack',
  PACKET: 'Packet',
  BOX: 'Box',
  CARTON: 'Carton',
  DOZEN: 'Dozen',
  ROLL: 'Roll',
  BUNDLE: 'Bundle',
  BAG: 'Bag',
  BOTTLE: 'Bottle',
  CAN: 'Can',
  JAR: 'Jar',
  TUBE: 'Tube',
  STRIP: 'Strip',
  SHEET: 'Sheet',
  REAM: 'Ream',
  METER: 'Meter',
  MTR: 'Meter',
  FOOT: 'Foot',
  FT: 'Foot',
  INCH: 'Inch',
  IN: 'Inch',
  GRAM: 'Gram',
  GM: 'Gram',
  G: 'Gram',
  KILOGRAM: 'Kilogram',
  KG: 'Kilogram',
  MILLILITER: 'Milliliter',
  ML: 'Milliliter',
  LITER: 'Liter',
  LTR: 'Liter',
  L: 'Liter',
  UNIT: 'Unit',
  CASE: 'Case',
  LOT: 'Lot',
};

const CANONICAL_LOOKUP = new Map(
  UNIT_OF_MEASURE_VALUES.map((value) => [value.toLowerCase(), value])
);

const resolveCanonicalUnitOfMeasure = (raw) => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  const alias = UNIT_OF_MEASURE_LEGACY_ALIASES[trimmed.toUpperCase()];
  if (alias) return alias;

  const canonical = CANONICAL_LOOKUP.get(trimmed.toLowerCase());
  if (canonical) return canonical;

  return null;
};

/**
 * Normalize optional unit_of_measure. Empty input returns ''.
 * @throws {AppError} when a non-empty value is not a supported unit.
 */
const normalizeUnitOfMeasure = (value, { allowEmpty = true } = {}) => {
  if (value == null || String(value).trim() === '') {
    return allowEmpty ? '' : null;
  }

  const canonical = resolveCanonicalUnitOfMeasure(value);
  if (!canonical) {
    throw new AppError(
      `Invalid unit_of_measure "${String(value).trim()}". Allowed values: ${UNIT_OF_MEASURE_VALUES.join(', ')}`,
      400,
      'INVALID_UNIT_OF_MEASURE'
    );
  }

  return canonical;
};

const isValidUnitOfMeasure = (value) => {
  if (value == null || String(value).trim() === '') return true;
  return Boolean(resolveCanonicalUnitOfMeasure(value));
};

module.exports = {
  UNIT_OF_MEASURE_VALUES,
  UNIT_OF_MEASURE_DESCRIPTIONS,
  UNIT_OF_MEASURE_LEGACY_ALIASES,
  normalizeUnitOfMeasure,
  isValidUnitOfMeasure,
};
