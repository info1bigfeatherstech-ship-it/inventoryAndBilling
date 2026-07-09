const FIELD_LABELS = {
  receive_remarks: 'receive remarks',
  cancel_reason: 'cancellation reason',
  rejection_reason: 'rejection reason',
  reject_reason: 'rejection reason',
  gstin: 'GSTIN',
  state_code: 'state code',
  legal_name: 'legal name',
  remarks: 'remarks',
  warehouse_code: 'warehouse code',
  warehouse_name: 'warehouse name',
  address: 'address',
  city: 'city',
  manager_name: 'manager name',
  from_warehouse_id: 'source warehouse',
  to_shop_id: 'destination shop',
  transfer_bill_type: 'transfer bill type',
  received_quantity: 'received quantity',
  tracking_number: 'tracking number',
  expected_delivery: 'expected delivery date',
};

const humanizeFieldName = (fieldPath = '') => {
  const key = String(fieldPath).replace(/^\d+\./, '').replace(/\[\d+\]/g, '');
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replace(/_/g, ' ').trim() || 'this field';
};

const humanizeValidatorMessage = (field, message) => {
  const label = humanizeFieldName(field);
  const msg = String(message || '').trim();

  if (!msg || msg === 'Invalid value' || msg === 'Invalid value.') {
    return `Please check ${label}.`;
  }

  if (/^Invalid /i.test(msg) && !/please/i.test(msg)) {
    return `Please enter a valid ${label}.`;
  }

  if (/required/i.test(msg) && !/please/i.test(msg)) {
    return `Please fill ${label}.`;
  }

  if (/must be/i.test(msg) && !/please/i.test(msg)) {
    return `Please fix ${label}: ${msg}`;
  }

  return msg;
};

const humanizeValidationErrors = (errors = []) => {
  if (!errors.length) return 'Please check the form and try again.';
  return errors
    .map((err) => humanizeValidatorMessage(err.field || err.path, err.message || err.msg))
    .join(' ');
};

module.exports = {
  humanizeFieldName,
  humanizeValidatorMessage,
  humanizeValidationErrors,
};
