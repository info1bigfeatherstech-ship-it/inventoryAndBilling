const { AppError } = require('../../../errors/AppError');
const CustomerService = require('../../customer/customer.service');

/**
 * Apply an offline-created customer.
 * Links to an existing server record when a matching mobile number is found (idempotent).
 */
const applyOfflineCustomer = async ({ item }) => {
  const data = item.payload || {};
  const customer = await CustomerService.createCustomer(data);
  return {
    server_id: customer.customer_id,
    data: customer,
  };
};

/**
 * Apply an offline customer edit.
 *
 * The payload must include `customer_id` (the server-side UUID) plus any
 * fields the user changed.  Uses the existing updateCustomer service which
 * already validates mobile uniqueness, GST fields, etc.
 *
 * Error cases:
 *  - Missing customer_id  → 400 CLIENT_ID_REQUIRED
 *  - Customer not on server yet → 404 CUSTOMER_NOT_FOUND (resolved as ERROR,
 *    not CONFLICT, so the sync panel retries it automatically)
 *  - Duplicate mobile → 409 DUPLICATE_MOBILE (surfaces as CONFLICT)
 */
const applyOfflineCustomerUpdate = async ({ item }) => {
  const data = item.payload || {};
  const { customer_id, ...fields } = data;

  if (!customer_id) {
    throw new AppError(
      'customer_id is required in customer_update payload',
      400,
      'CLIENT_ID_REQUIRED'
    );
  }

  const customer = await CustomerService.updateCustomer(customer_id, fields);
  return {
    server_id: customer.customer_id,
    data: customer,
  };
};

module.exports = {
  applyOfflineCustomer,
  applyOfflineCustomerUpdate,
};
