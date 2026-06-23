const asyncHandler = require('../../utils/asyncHandler.utils');
const SyncPullService = require('../../services/sync/syncPull.service');
const SyncPushService = require('../../services/sync/syncPush.service');
const { resolveSyncShopId } = require('../../services/sync/syncAccess.utils');
const { successResponse } = require('../../utils/response.utils');
const { SYNC_API_VERSION } = require('../../services/sync/sync.constants');

const SyncController = {
  pull: asyncHandler(async (req, res) => {
    const data = await SyncPullService.pull(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Offline sync pull completed',
      data,
    });
  }),

  push: asyncHandler(async (req, res) => {
    const data = await SyncPushService.push(req.body, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Offline sync push processed',
      data,
    });
  }),

  status: asyncHandler(async (req, res) => {
    const shopId = await resolveSyncShopId(req.user, req.query.shop_id);
    const handlers = SyncPushService._entityHandlers;
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Offline sync status',
      data: {
        sync_version: SYNC_API_VERSION,
        shop_id: shopId,
        server_time: new Date().toISOString(),
        push_handlers: {
          customer: handlers.has('customer'),
          customer_update: handlers.has('customer_update'),
          bill: handlers.has('bill'),
          bill_payment: handlers.has('bill_payment'),
          credit_note: handlers.has('credit_note'),
          stock_adjustment: handlers.has('stock_adjustment'),
          shop_expense: handlers.has('shop_expense'),
          transfer_receive: handlers.has('transfer_receive'),
        },
      },
    });
  }),
};

module.exports = SyncController;
