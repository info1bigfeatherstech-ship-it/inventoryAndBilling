const asyncHandler = require('../../utils/asyncHandler.utils');
const VendorService = require('../../services/vendor/vendor.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const VendorController = {
  create: asyncHandler(async (req, res) => {
    const vendor = await VendorService.createVendor(req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Vendor created successfully',
      data: vendor,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, vendors } = await VendorService.listVendors(req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Vendors fetched successfully',
      data: vendors,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const vendor = await VendorService.getVendorById(req.params.vendorId);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Vendor fetched successfully',
      data: vendor,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const vendor = await VendorService.updateVendor(req.params.vendorId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Vendor updated successfully',
      data: vendor,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await VendorService.softDeleteVendor(req.params.vendorId);
    return successResponse(res, req, {
      statusCode: 200,
      message: result.alreadyInactive ? 'Vendor already inactive' : 'Vendor deactivated successfully',
      data: { vendor_id: req.params.vendorId, is_active: false },
    });
  }),
};

module.exports = VendorController;
