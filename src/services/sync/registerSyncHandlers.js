const SyncPushService = require('./syncPush.service');
const { applyOfflineCustomer } = require('./handlers/syncCustomer.handler');
const { applyOfflineBill } = require('./handlers/syncBill.handler');
const { applyOfflineStockAdjustment } = require('./handlers/syncStockAdjustment.handler');
const { applyOfflineShopExpense } = require('./handlers/syncShopExpense.handler');

let registered = false;

const registerSyncHandlers = () => {
  if (registered) return;
  registered = true;

  SyncPushService.registerSyncHandler('customer', applyOfflineCustomer);
  SyncPushService.registerSyncHandler('bill', applyOfflineBill);
  SyncPushService.registerSyncHandler('stock_adjustment', applyOfflineStockAdjustment);
  SyncPushService.registerSyncHandler('shop_expense', applyOfflineShopExpense);
};

module.exports = {
  registerSyncHandlers,
};
