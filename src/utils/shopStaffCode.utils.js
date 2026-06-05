const { AppError } = require('../middlewares/error.middleware');

const STAFF_CODE_REGEX = /^[A-Z0-9][A-Z0-9_-]{1,14}$/;

const normalizeStaffCode = (value) => String(value || '').trim().toUpperCase();

const assertValidStaffCode = (code) => {
  const normalized = normalizeStaffCode(code);
  if (!STAFF_CODE_REGEX.test(normalized)) {
    throw new AppError(
      'Staff code must be 2–15 alphanumeric characters (e.g. SC001)',
      400,
      'INVALID_STAFF_CODE'
    );
  }
  return normalized;
};

const formatStaffCodeResponse = (row) => ({
  staff_code_id: row.staff_code_id,
  shop_id: row.shop_id,
  code: row.code,
  display_name: row.display_name,
  phone: row.phone,
  is_active: row.is_active,
  remarks: row.remarks,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

module.exports = {
  normalizeStaffCode,
  assertValidStaffCode,
  formatStaffCodeResponse,
};
