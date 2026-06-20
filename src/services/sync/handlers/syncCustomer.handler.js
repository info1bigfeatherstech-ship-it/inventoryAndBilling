const CustomerService = require('../../customer/customer.service');

/**
 * Apply an offline-created customer. Links to existing record when mobile matches.
 */
const applyOfflineCustomer = async ({ item }) => {
  const data = item.payload || {};
  const customer = await CustomerService.createCustomer(data);
  return {
    server_id: customer.customer_id,
    data: customer,
  };
};

module.exports = {
  applyOfflineCustomer,
};
