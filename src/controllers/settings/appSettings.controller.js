const asyncHandler = require('../../utils/asyncHandler.utils');
const AppSettingsService = require('../../services/settings/appSettings.service');
const { successResponse } = require('../../utils/response.utils');

const AppSettingsController = {
  getFranchiseSettings: asyncHandler(async (req, res) => {
    const data = await AppSettingsService.getFranchiseSettings();
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Franchise settings fetched successfully',
      data,
    });
  }),

  updateFranchiseSettings: asyncHandler(async (req, res) => {
    const data = await AppSettingsService.updateFranchiseSettings(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Franchise settings updated successfully',
      data,
    });
  }),
};

module.exports = AppSettingsController;
