const { AppError } = require('../middlewares/error.middleware');

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_ID_REGEX = /^[\w.\-]{2,256}@[\w.\-]{2,64}$/i;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const maskAccountNumber = (accountNumber) => {
  const raw = String(accountNumber || '').trim();
  if (!raw) return '';
  if (raw.length <= 4) return raw;
  return `${'X'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
};

const normalizeIfsc = (value) => String(value || '').trim().toUpperCase();

const assertValidIfsc = (ifsc) => {
  const code = normalizeIfsc(ifsc);
  if (!IFSC_REGEX.test(code)) {
    throw new AppError('Invalid IFSC code format', 400, 'INVALID_IFSC');
  }
  return code;
};

const assertValidUpiId = (upiId) => {
  const id = String(upiId || '').trim();
  if (!id) return null;
  if (!UPI_ID_REGEX.test(id)) {
    throw new AppError('Invalid UPI ID format', 400, 'INVALID_UPI_ID');
  }
  return id.toLowerCase();
};

const assertValidGstNumber = (gstNumber) => {
  const gst = String(gstNumber || '').trim().toUpperCase();
  if (gst === 'UNREGISTERED') return gst;
  if (!GSTIN_REGEX.test(gst)) {
    throw new AppError('Invalid GSTIN format (15 characters)', 400, 'INVALID_GSTIN');
  }
  return gst;
};

const formatBankAccountResponse = (row, { includeUpi = true } = {}) => ({
  bank_account_id: row.bank_account_id,
  gst_config_id: row.gst_config_id,
  account_holder_name: row.account_holder_name,
  bank_name: row.bank_name,
  branch_name: row.branch_name,
  account_number_masked: maskAccountNumber(row.account_number),
  ifsc_code: row.ifsc_code,
  upi_id: includeUpi ? row.upi_id : undefined,
  is_default: row.is_default,
  is_active: row.is_active,
  remarks: row.remarks,
  created_at: row.created_at,
  updated_at: row.updated_at,
  gst_config: row.gst_config
    ? {
        gst_config_id: row.gst_config.gst_config_id,
        gst_number: row.gst_config.gst_number,
        legal_name: row.gst_config.legal_name,
      }
    : undefined,
});

const sortAccountsDefaultFirst = (accounts) =>
  [...accounts].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return (a.bank_name || '').localeCompare(b.bank_name || '');
  });

module.exports = {
  maskAccountNumber,
  normalizeIfsc,
  assertValidIfsc,
  assertValidUpiId,
  assertValidGstNumber,
  formatBankAccountResponse,
  sortAccountsDefaultFirst,
};
