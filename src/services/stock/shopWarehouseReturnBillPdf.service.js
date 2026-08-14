const { AppError } = require('../../errors/AppError');
const AppSettingsService = require('../settings/appSettings.service');
const { buildTransferChallanPdfBuffer } = require('./transferChallanPdf.service');

/**
 * Map shop→WH return bill → same PDF shape as franchise NON_GST invoice.
 * Direction matches stock flow: From shop → Bill To warehouse.
 */
const toFranchiseNonGstPdfDoc = async (returnDoc) => {
  const shop = returnDoc.from_shop || {};
  const wh = returnDoc.to_warehouse || {};
  const totals = returnDoc.totals || {};
  const companyIdentity = await AppSettingsService.getCompanyInvoiceIdentity();
  const companyLegalName = companyIdentity.legal_name?.trim() || '';

  return {
    document_number: returnDoc.return_bill_number,
    transfer_bill_type: 'NON_GST_INVOICE',
    request_type: 'SHOP_TO_WH',
    request_type_label: 'Shop → Warehouse Return',
    status: returnDoc.status,
    document_date: returnDoc.return_bill_generated_at,
    tracking_number: returnDoc.source_bill_number || returnDoc.source_reference_number || '',
    // Issuer / Place of Dispatch = shop (stock leaving)
    issuer: {
      code: shop.shop_code || '',
      name: companyLegalName || shop.shop_name || 'Company',
      location_name: shop.shop_name || '',
      gstin: companyIdentity.gstin?.trim()?.toUpperCase() || '',
      address: shop.address || companyIdentity.address || '',
      city: shop.city || '',
      state_code: shop.state_code || companyIdentity.state_code || '',
      phone: shop.phone || companyIdentity.phone || '',
      email: companyIdentity.email || '',
      manager_name: null,
    },
    // Bill To / Place of Supply = warehouse (stock arriving)
    recipient: {
      code: wh.warehouse_code || '',
      name: wh.warehouse_name || '',
      legal_name: wh.legal_name || '',
      gstin: wh.gstin || '',
      address: wh.address || '',
      city: wh.city || '',
      pincode: '',
      phone: '',
      state_code: wh.state_code || '',
    },
    from_label: shop.shop_name || 'Shop',
    to_label: wh.warehouse_name || 'Warehouse',
    remarks: returnDoc.return_reason || '',
    is_franchise_bill: true,
    bill_format: 'FRANCHISE_TRANSFER_BILL',
    lines: returnDoc.lines || [],
    franchise_bill_totals: {
      mrp_subtotal: Number(totals.mrp_subtotal) || 0,
      franchise_subtotal: Number(totals.franchise_subtotal) || 0,
      discount: Number(totals.discount) || 0,
      taxable_amount: Number(totals.franchise_subtotal) || 0,
      gst_amount: 0,
      final_amount: Number(totals.final_amount) || 0,
    },
  };
};

const generateShopWarehouseReturnBillPdf = async (returnDoc) => {
  if (!returnDoc?.return_bill_number) {
    throw new AppError('Return bill not generated yet (approve first)', 409, 'RETURN_BILL_NOT_READY');
  }
  if (!returnDoc?.lines?.length) {
    throw new AppError('Return bill has no line items', 400, 'RETURN_BILL_EMPTY');
  }
  const pdfDoc = await toFranchiseNonGstPdfDoc(returnDoc);
  return buildTransferChallanPdfBuffer(pdfDoc);
};

module.exports = {
  generateShopWarehouseReturnBillPdf,
  toFranchiseNonGstPdfDoc,
};
