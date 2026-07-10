const prisma = require('../../utils/prisma.utils');

const { AppError } = require('../../errors/AppError');

const {

  roundMoney,

  calculateLineAmounts,

  buildTaxSummaryFromLines,

  normalizeStateCode,

  stateCodeFromGstin,

  normalizeProductGstType,

} = require('../../utils/billing.utils');

const { isFranchiseWhToShopTransfer } = require('../../utils/franchiseTransferPricing.utils');

const {

  snapshotFranchiseTransferPricing,

  isFranchiseShopType,

} = require('../../utils/franchisePrice.utils');

const AppSettingsService = require('../settings/appSettings.service');

const { generateTransferBillNumber } = require('../../utils/transferBill.utils');

const { signBulkTransferBillToken, signSingleTransferBillToken } = require('../../utils/transferBillToken.utils');



const REQUEST_TYPE_LABELS = {

  WH_TO_SHOP: 'Warehouse → Shop',

  WH_TO_WH: 'Warehouse → Warehouse',

  SHOP_TO_SHOP: 'Shop → Shop',

};



const VALID_BILL_TYPES = new Set(['GST_INVOICE', 'NON_GST_INVOICE', 'ESTIMATE_INVOICE']);



const WAREHOUSE_INVOICE_SELECT = {

  warehouse_id: true,

  warehouse_code: true,

  warehouse_name: true,

  address: true,

  city: true,

  manager_name: true,

  gstin: true,

  legal_name: true,

  state_code: true,

};



const getApprovedQty = (item) => {
  if (item.is_approved === false) return 0;
  if (item.approved_quantity != null) return Number(item.approved_quantity) || 0;
  return 0;
};



const resolveWarehouseStateCode = (warehouse) => {

  const fromField = normalizeStateCode(warehouse?.state_code);

  if (fromField) return fromField;

  return stateCodeFromGstin(warehouse?.gstin);

};



const assertWarehouseGstForInvoice = (warehouse) => {

  const gstin = warehouse?.gstin?.trim()?.toUpperCase() || '';

  if (!gstin || gstin.length < 15) {

    throw new AppError(

      'GST transfer bill requires warehouse GSTIN. Edit the source warehouse and add GSTIN before approving.',

      409,

      'WAREHOUSE_GSTIN_NOT_CONFIGURED'

    );

  }

};



const loadFranchiseShopGst = async (shopId, tx = prisma) => {

  if (!shopId) return null;

  const defaultRow = await tx.shopGstRegistration.findFirst({

    where: { shop_id: shopId, is_default: true, is_active: true },

    select: { gst_number: true, legal_name: true },

  });

  if (defaultRow) return defaultRow;

  return tx.shopGstRegistration.findFirst({

    where: { shop_id: shopId, is_active: true },

    orderBy: { created_at: 'asc' },

    select: { gst_number: true, legal_name: true },

  });

};



const assertFranchiseShopGstForInvoice = (shopGst) => {

  const gstin = shopGst?.gst_number?.trim()?.toUpperCase() || '';

  if (!gstin || gstin.length < 15) {

    throw new AppError(

      'GST transfer bill requires franchise shop GSTIN. Add GST registration in Shop Settings.',

      409,

      'SHOP_GSTIN_NOT_CONFIGURED'

    );

  }

};



const loadVariantForBill = async (tx, variantId) =>

  tx.productVariant.findUnique({

    where: { variant_id: variantId },

    select: {

      variant_id: true,

      sku: true,

      product_code: true,

      mrp: true,

      purchase_price: true,

      expenses: true,

      warranty: true,

      attributes: true,

      product: {

        select: {

          name: true,

          brand_name: true,

          hsn_code: true,

          gst_percent: true,

          gst_type: true,

          expenses: true,

          warranty: true,

        },

      },

    },

  });



const snapshotFranchiseOnApprovedItems = async (tx, bulk, markupPercent) => {

  const items = await tx.bulkTransferRequestItem.findMany({

    where: { bulk_request_id: bulk.bulk_request_id },

  });



  for (const item of items) {

    const qty = getApprovedQty(item);

    if (qty <= 0) {

      await tx.bulkTransferRequestItem.update({

        where: { bulk_item_id: item.bulk_item_id },

        data: {

          franchise_markup_percent_snapshot: null,

          franchise_mrp_snapshot: null,

          franchise_unit_price_snapshot: null,

          franchise_line_value_snapshot: null,

        },

      });

      continue;

    }



    const variant = await loadVariantForBill(tx, item.variant_id);

    const franchiseSnap = snapshotFranchiseTransferPricing(variant, qty, markupPercent);

    await tx.bulkTransferRequestItem.update({

      where: { bulk_item_id: item.bulk_item_id },

      data: franchiseSnap,

    });

  }

};



const assertFranchiseBillType = (billType) => {

  if (!billType || !VALID_BILL_TYPES.has(billType)) {

    throw new AppError(

      'transfer_bill_type is required (GST_INVOICE, NON_GST_INVOICE, or ESTIMATE_INVOICE) for franchise transfers',

      400,

      'TRANSFER_BILL_TYPE_REQUIRED'

    );

  }

};



const buildBillLines = (items, billType) => {

  const lines = [];



  for (const item of items) {

    const qty = getApprovedQty(item);

    if (qty <= 0) continue;



    const unitMrp = Number(item.franchise_mrp_snapshot) || 0;

    const unitFranchise = Number(item.franchise_unit_price_snapshot) || 0;

    const lineMrp = roundMoney(unitMrp * qty);

    const lineFranchise = roundMoney(unitFranchise * qty);



    const product = item.variant?.product;

    const gstPercent = Number(product?.gst_percent) || 0;

    const gstType =

      billType === 'GST_INVOICE'

        ? normalizeProductGstType(product?.gst_type)

        : product?.gst_type;



    const taxLine = calculateLineAmounts({

      quantity: qty,

      unitPrice: unitFranchise,

      gstPercent,

      gstType,

      billType,

      lineDiscount: 0,

    });



    lines.push({

      product_name: product?.name || 'Item',

      product_code: item.variant?.product_code || item.variant?.sku || '',

      sku: item.variant?.sku || '',

      brand_name: product?.brand_name || null,

      warranty: item.variant?.warranty || product?.warranty || null,

      attributes: item.variant?.attributes || null,

      hsn_code: product?.hsn_code || '',

      quantity: qty,

      unit_mrp: unitMrp,

      unit_franchise_price: unitFranchise,

      line_mrp_total: lineMrp,

      line_franchise_total: lineFranchise,

      gst_percent: gstPercent,

      gst_type: taxLine.gst_type,

      taxable_amount: taxLine.taxable_amount,

      tax_amount: taxLine.tax_amount,

      line_total: taxLine.line_total,

    });

  }



  return lines;

};



const computeBillTotals = (lines, billType) => {

  const mrpSubtotal = roundMoney(lines.reduce((s, l) => s + l.line_mrp_total, 0));

  const franchiseSubtotal = roundMoney(lines.reduce((s, l) => s + l.line_franchise_total, 0));



  if (billType !== 'GST_INVOICE') {

    return {

      mrp_subtotal: mrpSubtotal,

      franchise_subtotal: franchiseSubtotal,

      discount: roundMoney(mrpSubtotal - franchiseSubtotal),

      taxable_amount: franchiseSubtotal,

      gst_amount: 0,

      final_amount: franchiseSubtotal,

      tax_mode: 'EXEMPT',

    };

  }



  const pseudoItems = lines.map((l) => ({

    taxable_amount: l.taxable_amount,

    tax_amount: l.tax_amount,

    gst_percent: l.gst_percent,

    gst_type: l.gst_type,

  }));

  const gstSplit = buildTaxSummaryFromLines(pseudoItems);

  const gstAmount = roundMoney(gstSplit.cgst + gstSplit.sgst + gstSplit.igst);

  const taxable = roundMoney(lines.reduce((s, l) => s + l.taxable_amount, 0));



  return {

    mrp_subtotal: mrpSubtotal,

    franchise_subtotal: franchiseSubtotal,

    discount: roundMoney(mrpSubtotal - franchiseSubtotal),

    taxable_amount: taxable,

    gst_amount: gstAmount,

    cgst: gstSplit.cgst,

    sgst: gstSplit.sgst,

    igst: gstSplit.igst,

    tax_mode: gstSplit.tax_mode,

    final_amount: roundMoney(taxable + gstAmount),

    gst_split: gstSplit,

  };

};



const buildIssuerRecipient = (record, shopGst = null) => {

  const wh = record.from_warehouse;

  const shop = record.to_shop;

  const gstin = wh?.gstin?.trim()?.toUpperCase() || '';

  const recipientGstin = shopGst?.gst_number?.trim()?.toUpperCase() || '';

  const recipientLegalName = shopGst?.legal_name?.trim() || '';



  return {

    issuer: {

      code: wh?.warehouse_code || '',

      name: wh?.legal_name?.trim() || wh?.warehouse_name || 'Warehouse',

      gstin,

      address: wh?.address || '',

      city: wh?.city || '',

      state_code: resolveWarehouseStateCode(wh) || '',

      phone: '',

      manager_name: wh?.manager_name || null,

    },

    recipient: shop

      ? {

          code: shop.shop_code,

          name: shop.shop_name,

          legal_name: recipientLegalName,

          gstin: recipientGstin,

          address: shop.address,

          city: shop.city,

          pincode: shop.pincode,

          phone: shop.phone,

          state_code: shop.state_code,

        }

      : null,

  };

};



const buildBillLinesFromSingle = (request, billType) => {
  const qty = Number(request.quantity) || 0;
  if (qty <= 0) return [];
  return buildBillLines(
    [
      {
        is_approved: true,
        approved_quantity: qty,
        franchise_mrp_snapshot: request.franchise_mrp_snapshot,
        franchise_unit_price_snapshot: request.franchise_unit_price_snapshot,
        variant: request.variant,
      },
    ],
    billType
  );
};



const snapshotFranchiseOnSingleRequest = async (tx, request, markupPercent) => {
  const variant = await loadVariantForBill(tx, request.variant_id);
  const qty = Number(request.quantity) || 0;
  return snapshotFranchiseTransferPricing(variant, qty, markupPercent);
};



const SINGLE_BILL_INCLUDE = {
  from_warehouse: { select: WAREHOUSE_INVOICE_SELECT },
  to_shop: {
    select: {
      shop_id: true,
      shop_code: true,
      shop_name: true,
      address: true,
      city: true,
      pincode: true,
      phone: true,
      email: true,
      state_code: true,
      shop_type: true,
    },
  },
  variant: {
    select: {
      sku: true,
      product_code: true,
      warranty: true,
      attributes: true,
      product: {
        select: {
          name: true,
          brand_name: true,
          hsn_code: true,
          gst_percent: true,
          gst_type: true,
          warranty: true,
        },
      },
    },
  },
};



const TransferBillService = {

  VALID_BILL_TYPES,



  async prepareFranchiseApprove(tx, bulk, transferBillType) {

    const destShop =

      bulk.request_type === 'WH_TO_SHOP' && bulk.to_shop_id

        ? await tx.shop.findUnique({

            where: { shop_id: bulk.to_shop_id },

            select: { shop_type: true },

          })

        : null;



    if (!isFranchiseShopType(destShop?.shop_type)) {

      return null;

    }



    assertFranchiseBillType(transferBillType);



    const wh = await tx.warehouse.findUnique({

      where: { warehouse_id: bulk.from_warehouse_id },

      select: WAREHOUSE_INVOICE_SELECT,

    });

    if (!wh) {

      throw new AppError('Source warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');

    }

    if (transferBillType === 'GST_INVOICE') {

      assertWarehouseGstForInvoice(wh);

      if (bulk.to_shop_id) {

        const shopGst = await loadFranchiseShopGst(bulk.to_shop_id, tx);

        assertFranchiseShopGstForInvoice(shopGst);

      }

    }



    const markup = await AppSettingsService.getFranchiseMarkupPercent();

    await snapshotFranchiseOnApprovedItems(tx, bulk, markup);



    const billNumber = await generateTransferBillNumber(tx, wh.warehouse_code);



    return {

      transfer_bill_type: transferBillType,

      transfer_bill_number: billNumber,

      transfer_bill_generated_at: new Date(),

    };

  },



  async buildBulkTransferBillDocument(bulkRequestId) {

    const bulk = await prisma.bulkTransferRequest.findUnique({

      where: { bulk_request_id: bulkRequestId },

      include: {

        from_warehouse: { select: WAREHOUSE_INVOICE_SELECT },

        to_shop: {

          select: {

            shop_id: true,

            shop_code: true,

            shop_name: true,

            address: true,

            city: true,

            pincode: true,

            phone: true,

            email: true,

            state_code: true,

            shop_type: true,

          },

        },

        items: {

          where: { is_approved: true, approved_quantity: { gt: 0 } },

          include: {

            variant: {

              select: {

                sku: true,

                product_code: true,

                warranty: true,

                attributes: true,

                product: {

                  select: {

                    name: true,

                    brand_name: true,

                    hsn_code: true,

                    gst_percent: true,

                    gst_type: true,

                    warranty: true,

                  },

                },

              },

            },

          },

        },

      },

    });



    if (!bulk) throw new AppError('Bulk transfer request not found', 404, 'BULK_REQUEST_NOT_FOUND');

    if (!bulk.transfer_bill_type || !bulk.transfer_bill_number) {

      throw new AppError('Transfer bill has not been generated for this request', 409, 'TRANSFER_BILL_NOT_FOUND');

    }

    if (!isFranchiseWhToShopTransfer(bulk)) {

      throw new AppError('Not a franchise transfer bill', 400, 'NOT_FRANCHISE_TRANSFER_BILL');

    }

    if (bulk.transfer_bill_type === 'GST_INVOICE') {

      assertWarehouseGstForInvoice(bulk.from_warehouse);

    }



    let shopGst = null;

    if (bulk.transfer_bill_type === 'GST_INVOICE' && bulk.to_shop_id) {

      shopGst = await loadFranchiseShopGst(bulk.to_shop_id);

      assertFranchiseShopGstForInvoice(shopGst);

    }



    const { issuer, recipient } = buildIssuerRecipient(bulk, shopGst);

    const lines = buildBillLines(bulk.items, bulk.transfer_bill_type);

    if (!lines.length) {

      throw new AppError('Transfer bill has no approved line items', 400, 'TRANSFER_BILL_EMPTY');

    }



    const totals = computeBillTotals(lines, bulk.transfer_bill_type);



    return {

      document_number: bulk.transfer_bill_number,

      transfer_bill_type: bulk.transfer_bill_type,

      request_type: bulk.request_type,

      request_type_label: REQUEST_TYPE_LABELS[bulk.request_type] || bulk.request_type,

      status: bulk.status,

      document_date: bulk.transfer_bill_generated_at || bulk.approved_at,

      tracking_number: bulk.tracking_number,

      bulk_request_id: bulk.bulk_request_id,

      bulk_request_number: bulk.bulk_request_number,

      issuer,

      recipient,

      from_label: issuer.name,

      to_label: recipient?.name,

      remarks: bulk.request_remarks,

      is_franchise_bill: true,

      bill_format: 'FRANCHISE_TRANSFER_BILL',

      lines,

      franchise_bill_totals: totals,

      public_token: signBulkTransferBillToken(bulk.bulk_request_id),

    };

  },



  async computeFranchiseBillTotalsFromBulk(bulk) {

    if (!bulk?.transfer_bill_type || !bulk?.transfer_bill_number) return null;



    const approvedItems = (bulk.items || []).filter(

      (item) => item.is_approved !== false && Number(item.approved_quantity) > 0

    );

    const lines = buildBillLines(approvedItems, bulk.transfer_bill_type);

    if (!lines.length) return null;

    return computeBillTotals(lines, bulk.transfer_bill_type);

  },



  async prepareFranchiseApproveSingle(tx, request, transferBillType) {
    if (!isFranchiseWhToShopTransfer(request)) return null;

    assertFranchiseBillType(transferBillType);

    const wh = await tx.warehouse.findUnique({
      where: { warehouse_id: request.from_warehouse_id },
      select: WAREHOUSE_INVOICE_SELECT,
    });
    if (!wh) {
      throw new AppError('Source warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
    }

    if (transferBillType === 'GST_INVOICE') {
      assertWarehouseGstForInvoice(wh);
      if (request.to_shop_id) {
        const shopGst = await loadFranchiseShopGst(request.to_shop_id, tx);
        assertFranchiseShopGstForInvoice(shopGst);
      }
    }

    const markup = await AppSettingsService.getFranchiseMarkupPercent();
    const franchiseSnap = await snapshotFranchiseOnSingleRequest(tx, request, markup);

    const billNumber = await generateTransferBillNumber(tx, wh.warehouse_code);

    return {
      transfer_bill_type: transferBillType,
      transfer_bill_number: billNumber,
      transfer_bill_generated_at: new Date(),
      ...franchiseSnap,
    };
  },



  async buildSingleTransferBillDocument(requestId) {
    const request = await prisma.transferRequest.findUnique({
      where: { request_id: requestId },
      include: SINGLE_BILL_INCLUDE,
    });

    if (!request) throw new AppError('Transfer request not found', 404, 'TRANSFER_REQUEST_NOT_FOUND');
    if (!request.transfer_bill_type || !request.transfer_bill_number) {
      throw new AppError('Transfer bill has not been generated for this request', 409, 'TRANSFER_BILL_NOT_FOUND');
    }
    if (!isFranchiseWhToShopTransfer(request)) {
      throw new AppError('Not a franchise transfer bill', 400, 'NOT_FRANCHISE_TRANSFER_BILL');
    }

    if (request.transfer_bill_type === 'GST_INVOICE') {
      assertWarehouseGstForInvoice(request.from_warehouse);
    }

    let shopGst = null;
    if (request.transfer_bill_type === 'GST_INVOICE' && request.to_shop_id) {
      shopGst = await loadFranchiseShopGst(request.to_shop_id);
      assertFranchiseShopGstForInvoice(shopGst);
    }

    const { issuer, recipient } = buildIssuerRecipient(request, shopGst);
    const lines = buildBillLinesFromSingle(request, request.transfer_bill_type);
    if (!lines.length) {
      throw new AppError('Transfer bill has no line items', 400, 'TRANSFER_BILL_EMPTY');
    }

    const totals = computeBillTotals(lines, request.transfer_bill_type);

    return {
      document_number: request.transfer_bill_number,
      transfer_bill_type: request.transfer_bill_type,
      request_type: request.request_type,
      request_type_label: REQUEST_TYPE_LABELS[request.request_type] || request.request_type,
      status: request.status,
      document_date: request.transfer_bill_generated_at || request.approved_at,
      tracking_number: request.tracking_number,
      request_id: request.request_id,
      request_number: request.request_number,
      issuer,
      recipient,
      from_label: issuer.name,
      to_label: recipient?.name,
      remarks: request.request_remarks,
      is_franchise_bill: true,
      bill_format: 'FRANCHISE_TRANSFER_BILL',
      lines,
      franchise_bill_totals: totals,
      public_token: signSingleTransferBillToken(request.request_id),
    };
  },



  async computeFranchiseBillTotalsFromSingle(request) {
    if (!request?.transfer_bill_type || !request?.transfer_bill_number) return null;
    const lines = buildBillLinesFromSingle(request, request.transfer_bill_type);
    if (!lines.length) return null;
    return computeBillTotals(lines, request.transfer_bill_type);
  },



  signBulkTransferBillToken,

  signSingleTransferBillToken,

};



module.exports = TransferBillService;


