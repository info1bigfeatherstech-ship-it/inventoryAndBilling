const { AppError } = require('../../../errors/AppError');
const BillingService = require('../../billing/billing.service');

/**
 * Resolve customer reference from an offline bill payload.
 * @param {object} payload
 * @param {Map<string, object>} batchContext - client_id → handler result in current batch
 */
const resolveCustomerForOfflineBill = async (payload, batchContext) => {
  if (payload.customer_id) {
    return payload.customer_id;
  }

  const clientCustomerId = payload.offline_customer_client_id;
  if (!clientCustomerId) {
    return null;
  }

  const mapped = batchContext.get(clientCustomerId);
  if (mapped?.server_id) {
    return mapped.server_id;
  }

  throw new AppError(
    'Offline bill references a customer that has not synced yet. Retry sync after customer is applied.',
    409,
    'OFFLINE_CUSTOMER_NOT_SYNCED'
  );
};

/**
 * Apply an offline-created bill using the standard billing pipeline (server stock deduct + ledger).
 */
const applyOfflineBill = async ({ item, user, shopId, batchContext }) => {
  const payload = { ...(item.payload || {}) };

  if (Array.isArray(payload.credit_note_ids) && payload.credit_note_ids.length) {
    throw new AppError(
      'Credit note redemption is not supported for offline bills during sync',
      400,
      'OFFLINE_CREDIT_NOTE_NOT_SUPPORTED'
    );
  }

  const customerId = await resolveCustomerForOfflineBill(payload, batchContext);

  const billData = {
    shop_id: shopId,
    customer_id: customerId,
    customer_mobile: payload.customer_mobile,
    customer_name: payload.customer_name,
    customer_gstin: payload.customer_gstin,
    bill_type: payload.bill_type,
    place_of_supply_state_code: payload.place_of_supply_state_code,
    discount: payload.discount,
    items: payload.items,
    payment_method: payload.payment_method,
    payment_amount: payload.payment_amount,
    reference_no: payload.reference_no,
    bank_account_id: payload.bank_account_id,
    gst_config_id: payload.gst_config_id,
    sales_channel: payload.sales_channel || 'WALK_IN',
    staff_code_id: payload.staff_code_id,
    credit_note_ids: [],
  };

  const bill = await BillingService.createBill(billData, user);

  return {
    server_id: bill.bill_id,
    data: {
      ...bill,
      offline_bill_number: payload.offline_bill_number || null,
      offline_client_bill_id: item.client_id,
    },
  };
};

module.exports = {
  applyOfflineBill,
};
