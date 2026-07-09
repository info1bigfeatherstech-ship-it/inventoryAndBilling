const jwt = require('jsonwebtoken');
const config = require('../config/index.config');

const signBulkTransferBillToken = (bulkRequestId) =>
  jwt.sign({ kind: 'bulk_transfer_bill', bulkRequestId }, config.JWT_SECRET);

const signSingleTransferBillToken = (requestId) =>
  jwt.sign({ kind: 'single_transfer_bill', requestId }, config.JWT_SECRET);

const verifyTransferBillToken = (token) => {
  const decoded = jwt.verify(token, config.JWT_SECRET);
  if (!decoded?.kind || !decoded.bulkRequestId && !decoded.requestId) {
    throw new Error('INVALID_TRANSFER_BILL_TOKEN');
  }
  return decoded;
};

module.exports = {
  signBulkTransferBillToken,
  signSingleTransferBillToken,
  verifyTransferBillToken,
};
