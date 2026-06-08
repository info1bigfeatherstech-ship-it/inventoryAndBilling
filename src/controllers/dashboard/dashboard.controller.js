const asyncHandler = require('../../utils/asyncHandler.utils');
const DashboardOverviewService = require('../../services/dashboard/dashboardOverview.service');
const { successResponse } = require('../../utils/response.utils');

const DashboardController = {
  monthlyOverview: asyncHandler(async (req, res) => {
    const data = await DashboardOverviewService.getMonthlyOverview(req.user, req.query);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Monthly dashboard overview fetched successfully',
      data,
    });
  }),
};

module.exports = DashboardController;
