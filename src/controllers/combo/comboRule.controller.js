const ComboRuleService = require('../../services/combo/comboRule.service');
const asyncHandler = require('../../utils/asyncHandler.utils');
const { successResponse } = require('../../utils/response.utils');

const ComboRuleController = {
  list: asyncHandler(async (req, res) => {
    const data = await ComboRuleService.listRules(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Combo rules fetched',
      data: data.rules,
      meta: { total: data.total, page: data.page, limit: data.limit },
    });
  }),

  listActive: asyncHandler(async (req, res) => {
    const rules = await ComboRuleService.listActiveRulesForBilling();
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Active combo rules fetched',
      data: rules,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const rule = await ComboRuleService.getRuleById(req.params.comboRuleId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Combo rule fetched',
      data: rule,
    });
  }),

  create: asyncHandler(async (req, res) => {
    const rule = await ComboRuleService.createRule(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Combo rule created',
      data: rule,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const rule = await ComboRuleService.updateRule(req.params.comboRuleId, req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Combo rule updated',
      data: rule,
    });
  }),

  setActive: asyncHandler(async (req, res) => {
    const rule = await ComboRuleService.setActive(
      req.params.comboRuleId,
      req.body.is_active,
      req.user
    );
    return successResponse(res, req, {
      statusCode: 200,
      message: rule.is_active ? 'Combo rule activated' : 'Combo rule deactivated',
      data: rule,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await ComboRuleService.deleteRule(req.params.comboRuleId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Combo rule deleted',
      data: result,
    });
  }),
};

module.exports = ComboRuleController;
