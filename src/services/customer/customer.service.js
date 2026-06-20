const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const {
  getLoyaltyDiscountPercent,
  normalizeStateCode,
  roundMoney,
} = require('../../utils/billing.utils');
const {
  isGstCustomer,
  validateGstFields,
  validateBillTypeForCustomer,
  resolveCustomerType,
  GST_FIELDS,
} = require('../../utils/customer.utils');
const logger = require('../../utils/logger.utils');

const CUSTOMER_SELECT = {
  customer_id: true,
  mobile: true,
  name: true,
  email: true,
  is_gst_registered: true,
  company_name: true,
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

const normalizeMobile = (mobile) => {
  const digits = String(mobile).replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits)) {
    throw new AppError('mobile must be a 10-digit number', 400, 'INVALID_MOBILE', { field: 'mobile' });
  }
  return digits;
};

const mapCustomerResponse = (customer) => {
  if (!customer) return null;
  return {
    ...customer,
    customer_type: customer.is_gst_registered ? 'GST' : 'WALK_IN',
  };
};

const buildCustomerData = (data) => {
  const mobile = normalizeMobile(data.mobile);
  const isGstRegistered = data.is_gst_registered === true || data.customer_type === 'GST';
  const base = {
    mobile,
    name: String(data.name).trim(),
    email: data.email?.trim() || null,
    is_gst_registered: isGstRegistered,
    remarks: data.remarks?.trim() || null,
  };

  if (isGstRegistered) {
    const gstFields = validateGstFields(data, { requireAll: false });
    return {
      ...base,
      ...gstFields,
    };
  }

  return {
    ...base,
    company_name: data.company_name?.trim() || null,
    gst_number: data.gst_number?.trim() || null,
    address: data.address?.trim() || null,
    city: data.city?.trim() || null,
    state_code: data.state_code?.trim() || null,
    pincode: data.pincode?.trim() || null,
  };
};

const CustomerService = {
  /**
   * Create or update customer by mobile (idempotent upsert).
   */
  async createCustomer(data, user = null) {
    try {
      if (!data.name?.trim()) {
        throw new AppError('Name is required', 400, 'NAME_REQUIRED', { field: 'name' });
      }

      const payload = buildCustomerData(data);
      const existing = await prisma.customer.findUnique({ where: { mobile: payload.mobile } });

      if (existing) {
        const customer = await prisma.customer.update({
          where: { customer_id: existing.customer_id },
          data: {
            name: payload.name,
            email: payload.email,
            is_gst_registered: payload.is_gst_registered,
            company_name: payload.company_name,
            gst_number: payload.gst_number,
            address: payload.address,
            city: payload.city,
            state_code: payload.state_code != null ? normalizeStateCode(payload.state_code) : null,
            pincode: payload.pincode,
            remarks: payload.remarks,
            is_active: true,
          },
          select: CUSTOMER_SELECT,
        });

        logger.info('Customer updated via create (mobile exists)', {
          customer_id: customer.customer_id,
          mobile: customer.mobile,
          is_gst_registered: customer.is_gst_registered,
          updated_by: user?.userId || null,
        });
        return mapCustomerResponse(customer);
      }

      const creditLimit = data.credit_limit != null ? Number(data.credit_limit) : null;
      if (creditLimit != null && creditLimit < 0) {
        throw new AppError('credit_limit must be >= 0', 400, 'INVALID_CREDIT_LIMIT');
      }

      const customer = await prisma.customer.create({
        data: {
          ...payload,
          state_code: payload.state_code != null ? normalizeStateCode(payload.state_code) : null,
          credit_limit: creditLimit,
          credit_balance: creditLimit ?? 0,
          loyalty_tier: null,
        },
        select: CUSTOMER_SELECT,
      });

      logger.info('Customer created', {
        customer_id: customer.customer_id,
        mobile: customer.mobile,
        is_gst_registered: customer.is_gst_registered,
        created_by: user?.userId || null,
      });
      return mapCustomerResponse(customer);
    } catch (err) {
      logger.error('createCustomer failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Exact mobile lookup for billing (returns null when not found).
   */
  async searchCustomerByMobile(mobile) {
    const normalized = normalizeMobile(mobile);
    const customer = await prisma.customer.findUnique({
      where: { mobile: normalized },
      select: CUSTOMER_SELECT,
    });
    if (customer && !customer.is_active) return null;
    return mapCustomerResponse(customer);
  },

  /**
   * Find customer by mobile (throws 404).
   */
  async getCustomerByMobile(mobile) {
    const customer = await this.searchCustomerByMobile(mobile);
    if (!customer) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
    return customer;
  },

  /**
   * Get customer by id with recent bills.
   */
  async getCustomerById(customerId) {
    const customer = await prisma.customer.findUnique({
      where: { customer_id: customerId },
      select: {
        ...CUSTOMER_SELECT,
        bills: {
          take: 10,
          orderBy: { created_at: 'desc' },
          select: {
            bill_id: true,
            bill_number: true,
            total_amount: true,
            payment_status: true,
            created_at: true,
            shop_id: true,
          },
        },
      },
    });
    if (!customer) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
    return mapCustomerResponse(customer);
  },

  /**
   * List customers with filters and pagination.
   */
  async listCustomers(filters = {}) {
    const { page, limit, skip, take } = parsePagination(filters, { page: 1, limit: 20, maxLimit: 100 });
    const where = { is_active: true };

    if (filters.include_inactive === true || filters.include_inactive === 'true') {
      delete where.is_active;
    }

    if (filters.loyalty_tier) where.loyalty_tier = filters.loyalty_tier;
    if (filters.customer_type) {
      where.is_gst_registered = (filters.customer_type === 'GST');
    }
    if (filters.mobile) where.mobile = { contains: normalizeMobile(filters.mobile) };
    if (filters.name) where.name = { contains: String(filters.name).trim(), mode: 'insensitive' };

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { updated_at: 'desc' },
        select: CUSTOMER_SELECT,
      }),
    ]);

    const mappedCustomers = customers.map(mapCustomerResponse);
    return { total, page, limit, customers: mappedCustomers };
  },

  /**
   * Search by mobile and/or name.
   * Exact 10-digit mobile returns single-customer shape for billing.
   */
  async searchCustomers(query = {}) {
    const mobileQuery = query.mobile ? String(query.mobile).replace(/\D/g, '') : '';
    const nameQuery = query.name ? String(query.name).trim() : '';

    if (mobileQuery.length === 10 && !nameQuery) {
      const customer = await this.searchCustomerByMobile(mobileQuery);
      return { customer };
    }

    const where = { is_active: true };
    const or = [];

    if (mobileQuery) {
      or.push({ mobile: { contains: mobileQuery } });
    }
    if (nameQuery) {
      or.push({ name: { contains: nameQuery, mode: 'insensitive' } });
    }

    if (!or.length) {
      throw new AppError('Provide mobile or name to search', 400, 'SEARCH_QUERY_REQUIRED');
    }

    where.OR = or;

    const customers = await prisma.customer.findMany({
      where,
      take: 20,
      orderBy: { name: 'asc' },
      select: CUSTOMER_SELECT,
    });

    const mappedCustomers = customers.map(mapCustomerResponse);
    return { customers: mappedCustomers };
  },

  /**
   * Upgrade WALK_IN customer to GST.
   */
  async upgradeCustomerToGst(customerId, data, user = null) {
    const existing = await prisma.customer.findUnique({ where: { customer_id: customerId } });
    if (!existing) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
    if (!existing.is_active) throw new AppError('Customer is inactive', 409, 'CUSTOMER_INACTIVE');
    if (existing.is_gst_registered) {
      throw new AppError('Customer is already GST type', 400, 'ALREADY_GST');
    }

    const gstFields = validateGstFields(data, { requireAll: true });

    const customer = await prisma.customer.update({
      where: { customer_id: customerId },
      data: {
        is_gst_registered: true,
        company_name: gstFields.company_name,
        gst_number: gstFields.gst_number,
        address: gstFields.address,
        city: gstFields.city,
        state_code: normalizeStateCode(gstFields.state_code),
        pincode: gstFields.pincode,
      },
      select: CUSTOMER_SELECT,
    });

    logger.info('Customer upgraded to GST', {
      customer_id: customerId,
      mobile: customer.mobile,
      upgraded_by: user?.userId || null,
      previous_type: 'WALK_IN',
      new_type: 'GST',
    });

    return mapCustomerResponse(customer);
  },

  /**
   * Update customer fields (type-aware).
   */
  async updateCustomer(customerId, data, user = null) {
    const existing = await prisma.customer.findUnique({ where: { customer_id: customerId } });
    if (!existing) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');

    if (data.customer_type !== undefined) {
      data.is_gst_registered = (data.customer_type === 'GST');
    }

    if (data.mobile) {
      const mobile = normalizeMobile(data.mobile);
      if (mobile !== existing.mobile) {
        const dup = await prisma.customer.findUnique({ where: { mobile } });
        if (dup) throw new AppError('Customer with this mobile already exists', 409, 'DUPLICATE_MOBILE');
      }
    }

    const payload = {};
    const allowed = ['name', 'email', 'remarks', 'is_active'];
    for (const key of allowed) {
      if (data[key] !== undefined) payload[key] = data[key];
    }

    if (data.is_gst_registered !== undefined) payload.is_gst_registered = data.is_gst_registered;
    if (data.company_name !== undefined) payload.company_name = data.company_name?.trim() || null;
    if (data.gst_number !== undefined) {
      payload.gst_number = data.gst_number ? validateGstFields({ ...existing, ...data }, { requireAll: false }).gst_number : null;
    }
    if (data.address !== undefined) payload.address = data.address?.trim() || null;
    if (data.city !== undefined) payload.city = data.city?.trim() || null;
    if (data.state_code !== undefined) {
      payload.state_code = data.state_code != null ? normalizeStateCode(data.state_code) : null;
    }
    if (data.pincode !== undefined) payload.pincode = data.pincode?.trim() || null;

    if (data.mobile !== undefined) payload.mobile = normalizeMobile(data.mobile);
    if (data.credit_limit !== undefined) {
      const limit = data.credit_limit != null ? Number(data.credit_limit) : null;
      if (limit != null && limit < 0) throw new AppError('credit_limit must be >= 0', 400, 'INVALID_CREDIT_LIMIT');
      payload.credit_limit = limit;
      payload.credit_balance = limit != null ? Math.max(0, limit - (existing.credit_used || 0)) : existing.credit_balance;
    }

    const customer = await prisma.customer.update({
      where: { customer_id: customerId },
      data: payload,
      select: CUSTOMER_SELECT,
    });

    logger.info('Customer updated', { customer_id: customerId, updated_by: user?.userId || null });
    return mapCustomerResponse(customer);
  },

  /**
   * Soft-delete customer.
   */
  async softDeleteCustomer(customerId) {
    const existing = await prisma.customer.findUnique({ where: { customer_id: customerId } });
    if (!existing) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');

    const customer = await prisma.customer.update({
      where: { customer_id: customerId },
      data: { is_active: false },
      select: CUSTOMER_SELECT,
    });

    logger.info('Customer soft-deleted', { customer_id: customerId });
    return mapCustomerResponse(customer);
  },

  async restoreCustomer(customerId) {
    const existing = await prisma.customer.findUnique({
      where: { customer_id: customerId },
    });
    if (!existing) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
    if (existing.is_active) throw new AppError('Customer is already active', 409, 'ALREADY_ACTIVE');

    const customer = await prisma.customer.update({
      where: { customer_id: customerId },
      data: { is_active: true },
      select: CUSTOMER_SELECT,
    });

    logger.info('Customer restored', { customer_id: customerId });
    return mapCustomerResponse(customer);
  },

  /**
   * Manually update customer loyalty tier (Super Admin only)
   */
  async updateLoyaltyTierManual(customerId, loyaltyTier) {
    const customer = await prisma.customer.findUnique({
      where: { customer_id: customerId },
      select: { customer_id: true, is_active: true },
    });
    if (!customer) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
    if (!customer.is_active) throw new AppError('Customer is inactive', 409, 'CUSTOMER_INACTIVE');

    const validTiers = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', null];
    if (loyaltyTier !== undefined && !validTiers.includes(loyaltyTier)) {
      throw new AppError('Invalid loyalty tier', 400, 'INVALID_TIER');
    }

    const updated = await prisma.customer.update({
      where: { customer_id: customerId },
      data: { loyalty_tier: loyaltyTier },
      select: CUSTOMER_SELECT,
    });

    logger.info('Customer loyalty tier manually updated', {
      customer_id: customerId,
      loyalty_tier: loyaltyTier,
    });

    return mapCustomerResponse(updated);
  },

  /**
   * Update spend stats after a bill (call inside transaction).
   */
  async updateCustomerSpend(customerId, amount, tx = prisma) {
    const delta = roundMoney(amount);
    const customer = await tx.customer.findUnique({
      where: { customer_id: customerId },
      select: { customer_id: true, total_spent: true, total_orders: true },
    });
    if (!customer) return null;

    const newSpent = roundMoney(Math.max(0, (customer.total_spent || 0) + delta));
    const orderDelta = delta > 0 ? 1 : delta < 0 ? -1 : 0;
    const newOrders = Math.max(0, (customer.total_orders || 0) + orderDelta);

    const updated = await tx.customer.update({
      where: { customer_id: customerId },
      data: {
        total_spent: newSpent,
        total_orders: newOrders,
        ...(delta > 0 ? { last_purchase: new Date() } : {}),
      },
      select: CUSTOMER_SELECT,
    });

    return mapCustomerResponse(updated);
  },

  /**
   * Loyalty discount percent for a customer id (0 if none).
   */
  async getCustomerDiscountPercent(customerId) {
    if (!customerId) return 0;
    const customer = await prisma.customer.findUnique({
      where: { customer_id: customerId },
      select: { loyalty_tier: true, is_active: true },
    });
    if (!customer || !customer.is_active) return 0;
    return getLoyaltyDiscountPercent(customer.loyalty_tier);
  },

  validateBillTypeForCustomer,
};

module.exports = CustomerService;
