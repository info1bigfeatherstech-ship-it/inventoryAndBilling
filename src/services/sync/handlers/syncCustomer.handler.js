const prisma = require('../../../utils/prisma.utils');
const { AppError } = require('../../../errors/AppError');
const CustomerService = require('../../customer/customer.service');

const CUSTOMER_SELECT = {
  customer_id: true,
  mobile: true,
  name: true,
  email: true,
  gst_number: true,
  address: true,
  city: true,
  state_code: true,
  pincode: true,
  total_spent: true,
  total_orders: true,
  last_purchase: true,
  loyalty_tier: true,
  credit_limit: true,
  credit_balance: true,
  credit_used: true,
  is_active: true,
  remarks: true,
  created_at: true,
  updated_at: true,
};

/**
 * Apply an offline-created customer. Links to existing record when mobile matches.
 */
const applyOfflineCustomer = async ({ item }) => {
  const data = item.payload || {};

  try {
    const customer = await CustomerService.createCustomer(data);
    return {
      server_id: customer.customer_id,
      data: customer,
    };
  } catch (err) {
    if (err.code === 'DUPLICATE_MOBILE') {
      const mobile = String(data.mobile || '').replace(/\D/g, '');
      const existing = await prisma.customer.findUnique({
        where: { mobile },
        select: CUSTOMER_SELECT,
      });
      if (!existing) {
        throw new AppError('Customer mobile conflict could not be resolved', 409, 'DUPLICATE_MOBILE');
      }
      return {
        server_id: existing.customer_id,
        data: existing,
        linked_existing: true,
      };
    }
    throw err;
  }
};

module.exports = {
  applyOfflineCustomer,
};
