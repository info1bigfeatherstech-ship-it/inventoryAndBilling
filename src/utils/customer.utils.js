const { AppError } = require('../errors/AppError');

const GST_NUMBER_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const GST_FIELDS = ['company_name', 'gst_number', 'address', 'city', 'state_code', 'pincode'];

const isGstCustomer = (customer) => customer?.is_gst_registered === true;

const validateGstNumber = (gstNumber) => {
  const gst = String(gstNumber || '').trim().toUpperCase();
  if (gst.length !== 15) {
    throw new AppError('GST number must be 15 characters', 400, 'INVALID_GST_NUMBER', { field: 'gst_number' });
  }
  if (!GST_NUMBER_REGEX.test(gst)) {
    throw new AppError('GST number format is invalid', 400, 'INVALID_GST_NUMBER', { field: 'gst_number' });
  }
  return gst;
};

const validateGstFields = (data, { requireAll = true } = {}) => {
  const missing = GST_FIELDS.filter((field) => !String(data[field] || '').trim());
  if (requireAll && missing.length) {
    throw new AppError(
      `GST customer requires ${missing.join(', ')}`,
      400,
      'GST_FIELDS_REQUIRED'
    );
  }

  const gstNumber = data.gst_number ? validateGstNumber(data.gst_number) : null;
  const stateCode = String(data.state_code || '').trim();
  if (stateCode && !/^\d{2}$/.test(stateCode)) {
    throw new AppError('state_code must be 2 digits', 400, 'INVALID_STATE_CODE', { field: 'state_code' });
  }

  return {
    company_name: String(data.company_name || '').trim() || null,
    gst_number: gstNumber,
    address: String(data.address || '').trim() || null,
    city: String(data.city || '').trim() || null,
    state_code: stateCode || null,
    pincode: String(data.pincode || '').trim() || null,
  };
};

const assertCustomerHasGstDetails = (customer) => {
  const missing = GST_FIELDS.filter((field) => !String(customer[field] || '').trim());
  if (missing.length) {
    throw new AppError(
      `GST bill requires customer fields: ${missing.join(', ')}`,
      400,
      'CUSTOMER_GST_INCOMPLETE'
    );
  }
};

const validateBillTypeForCustomer = (customer, billType) => {
  // ANY customer can generate ANY bill type on every visit. No restrictions.
  return;
};

const resolveCustomerType = (data) => {
  // Map customer_type for backward compatibility or return standard
  if (data.is_gst_registered || data.customer_type === 'GST') {
    return 'GST';
  }
  return 'WALK_IN';
};

module.exports = {
  GST_FIELDS,
  GST_NUMBER_REGEX,
  isGstCustomer,
  validateGstNumber,
  validateGstFields,
  assertCustomerHasGstDetails,
  validateBillTypeForCustomer,
  resolveCustomerType,
};
