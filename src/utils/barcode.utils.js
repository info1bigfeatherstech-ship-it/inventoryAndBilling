const { AppError } = require('../middlewares/error.middleware');

/** EAN-13 check digit (12 digits → 13th digit). */
const ean13CheckDigit = (twelveDigits) => {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const n = parseInt(twelveDigits[i], 10);
    sum += n * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
};

/**
 * Generate a unique numeric system barcode for warehouse labelling.
 * Prefix 21 = internal/private label range (not GS1 registered — replace in production if needed).
 */
const generateSystemBarcode = async (tx, { maxAttempts = 12 } = {}) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let body = '21';
    while (body.length < 12) {
      body += Math.floor(Math.random() * 10);
    }
    body = body.slice(0, 12);
    const candidate = body + ean13CheckDigit(body);

    const exists = await tx.productVariant.findFirst({
      where: { system_barcode: candidate },
      select: { variant_id: true },
    });
    if (!exists) return candidate;
  }

  throw new AppError('Failed to generate unique system barcode', 500, 'BARCODE_GENERATION_FAILED');
};

module.exports = {
  generateSystemBarcode,
  ean13CheckDigit,
};
