const asyncHandler = require('../../utils/asyncHandler.utils');
const CustomerService = require('../../services/customer/customer.service');
const BillingService = require('../../services/billing/billing.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const CustomerController = {
  create: asyncHandler(async (req, res) => {
    const data = await CustomerService.createCustomer(req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Customer created successfully',
      data,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, customers } = await CustomerService.listCustomers(req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Customers fetched successfully',
      data: customers,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  search: asyncHandler(async (req, res) => {
    const customers = await CustomerService.searchCustomers(req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Customer search completed',
      data: customers,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await CustomerService.getCustomerById(req.params.customerId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Customer fetched successfully',
      data,
    });
  }),

  getBills: asyncHandler(async (req, res) => {
    const { total, page, limit, bills } = await BillingService.listBills(
      { ...req.query, customer_id: req.params.customerId, limit: req.query.limit || 20 },
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Customer bills fetched successfully',
      data: bills,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  update: asyncHandler(async (req, res) => {
    const data = await CustomerService.updateCustomer(req.params.customerId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Customer updated successfully',
      data,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const data = await CustomerService.softDeleteCustomer(req.params.customerId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Customer deactivated successfully',
      data,
    });
  }),
};

module.exports = CustomerController;
