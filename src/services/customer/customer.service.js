const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const {
  calculateLoyaltyTier,
  getLoyaltyDiscountPercent,
  normalizeStateCode,
  roundMoney,
} = require('../../utils/billing.utils');
const logger = require('../../utils/logger.utils');

const CUSTOMER_SELECT = {
  customer_id: true,
  mobile: true,
  name: true,
  email: true,
  gst_number: true,
  address: true,
  city: true,
  state_code: true,
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
    throw new AppError('mobile must be a 10-digit number', 400, 'INVALID_MOBILE');
  }
  return digits;
};

const CustomerService = {
  /**
   * Create a new customer.
   */
  async createCustomer(data) {
    try {
      const mobile = normalizeMobile(data.mobile);
      const existing = await prisma.customer.findUnique({ where: { mobile } });
      if (existing) {
        throw new AppError('Customer with this mobile already exists', 409, 'DUPLICATE_MOBILE');
      }

      const stateCode = data.state_code != null ? normalizeStateCode(data.state_code) : null;
      const creditLimit = data.credit_limit != null ? Number(data.credit_limit) : null;
      if (creditLimit != null && creditLimit < 0) {
        throw new AppError('credit_limit must be >= 0', 400, 'INVALID_CREDIT_LIMIT');
      }

      const customer = await prisma.customer.create({
        data: {
          mobile,
          name: String(data.name).trim(),
          email: data.email?.trim() || null,
          gst_number: data.gst_number?.trim() || null,
          address: data.address?.trim() || null,
          city: data.city?.trim() || null,
          state_code: stateCode,
          credit_limit: creditLimit,
          credit_balance: creditLimit ?? 0,
          remarks: data.remarks?.trim() || null,
          loyalty_tier: null,
        },
        select: CUSTOMER_SELECT,
      });

      logger.info('Customer created', { customer_id: customer.customer_id, mobile });
      return customer;
    } catch (err) {
      logger.error('createCustomer failed', { error: err.message, stack: err.stack });
      throw err;
    }
  },

  /**
   * Find customer by mobile (primary lookup).
   */
  async getCustomerByMobile(mobile) {
    const normalized = normalizeMobile(mobile);
    const customer = await prisma.customer.findUnique({
      where: { mobile: normalized },
      select: CUSTOMER_SELECT,
    });
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
    return customer;
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

    return { total, page, limit, customers };
  },

  /**
   * Search by mobile and/or name.
   */
  async searchCustomers(query = {}) {
    const where = { is_active: true };
    const or = [];

    if (query.mobile) {
      or.push({ mobile: { contains: normalizeMobile(query.mobile) } });
    }
    if (query.name) {
      or.push({ name: { contains: String(query.name).trim(), mode: 'insensitive' } });
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

    return customers;
  },

  /**
   * Update customer fields.
   */
  async updateCustomer(customerId, data) {
    const existing = await prisma.customer.findUnique({ where: { customer_id: customerId } });
    if (!existing) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');

    if (data.mobile) {
      const mobile = normalizeMobile(data.mobile);
      if (mobile !== existing.mobile) {
        const dup = await prisma.customer.findUnique({ where: { mobile } });
        if (dup) throw new AppError('Customer with this mobile already exists', 409, 'DUPLICATE_MOBILE');
      }
    }

    const payload = {};
    const allowed = ['name', 'email', 'gst_number', 'address', 'city', 'remarks', 'is_active'];
    for (const key of allowed) {
      if (data[key] !== undefined) payload[key] = data[key];
    }
    if (data.mobile !== undefined) payload.mobile = normalizeMobile(data.mobile);
    if (data.state_code !== undefined) {
      payload.state_code = data.state_code != null ? normalizeStateCode(data.state_code) : null;
    }
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

    logger.info('Customer updated', { customer_id: customerId });
    return customer;
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
    return customer;
  },

 /**
 * @deprecated - Use manual update via API instead
 * Only for backward compatibility
 */
// async updateLoyaltyTier(customerId, tx = prisma) {
//   // Keep but don't call automatically
//   const customer = await tx.customer.findUnique({
//     where: { customer_id: customerId },
//     select: { customer_id: true, total_spent: true, loyalty_tier: true },
//   });
//   if (!customer) return null;

//   const tier = calculateLoyaltyTier(customer.total_spent);
//   if (tier === customer.loyalty_tier) return customer;

//   return tx.customer.update({
//     where: { customer_id: customerId },
//     data: { loyalty_tier: tier },
//     select: CUSTOMER_SELECT,
//   });
// },


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

  return updated;
},
  /**
   * Update spend stats after a bill (call inside transaction).
   * @param {string} customerId
   * @param {number} amount - Positive for sale, negative for cancellation reversal
   * @param {import('@prisma/client').Prisma.TransactionClient} tx
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
  
    // ✅ REMOVE loyalty_tier from update
    return tx.customer.update({
      where: { customer_id: customerId },
      data: {
        total_spent: newSpent,
        total_orders: newOrders,
        ...(delta > 0 ? { last_purchase: new Date() } : {}),
        // ✅ loyalty_tier NOT updated here
      },
      select: CUSTOMER_SELECT,
    });
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
};

module.exports = CustomerService;
