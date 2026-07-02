const jwt = require('jsonwebtoken');
const config = require('../../config/index.config');
const prisma = require('../../utils/prisma.utils');

const _generatePublicToken = (billId) => {
  // FUTURE UPGRADE: To expire the link in X days, change this line to:
  // return jwt.sign({ billId }, config.JWT_SECRET, { expiresIn: '30d' }); // e.g., '10d', '7d' etc.
  return jwt.sign({ billId }, config.JWT_SECRET);
};
const { AppError } = require('../../errors/AppError');
const { parsePagination } = require('../../utils/pagination.utils');
const { createStockLedgerEntry } = require('../stock/stockLedger.helpers');
const ShopStockService = require('../shop/shopStock.service');
const CustomerService = require('../customer/customer.service');
const CreditNoteService = require('../creditNote/creditNote.service');
const { generateBillPdf } = require('./billPdf.service');
const {
  resolveBillingShopId,
  assertBillReadAccess,
  assertBillWriteAccess,
  applyBillListScope,
} = require('../../utils/billAccess.utils');
const {
  roundMoney,
  isIntraStateSupply,
  buildTaxSummaryFromLines,
  calculateLineAmounts,
  computeBillTotals,
  parseExtraDiscountAmount,
  splitGstComponents,
  derivePaymentStatus,
  resolvePlaceOfSupplyStateCode,
  normalizeProductGstType,
  normalizeStateCode,
  stateCodeFromGstin,
} = require('../../utils/billing.utils');
const { generateBillNumber } = require('../../utils/billNumber.utils');
const ShopBankAccountService = require('../shop/shopBankAccount.service');
const ShopStaffCodeService = require('../shop/shopStaffCode.service');
const logger = require('../../utils/logger.utils');

const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 };

const BILL_SELECT = {
  bill_id: true,
  bill_number: true,
  shop_id: true,
  customer_id: true,
  bill_type: true,
  customer_mobile: true,
  customer_name: true,
  customer_gstin: true,
  place_of_supply_state_code: true,
  subtotal: true,
  discount: true,
  taxable_amount: true,
  gst_amount: true,
  total_amount: true,
  payment_status: true,
  payment_method: true,
  paid_amount: true,
  balance_amount: true,
  gst_config_id: true,
  bank_account_id: true,
  sales_channel: true,
  pdf_storage_key: true,
  is_cancelled: true,
  cancelled_at: true,
  cancelled_by_user_id: true,
  cancel_reason: true,
  created_by_user_id: true,
  staff_code_id: true,
  staff_code_value: true,
  staff_name_snapshot: true,
  created_at: true,
  updated_at: true,
  place_of_supply_state_code: true,
  shop: {
    select: {
      shop_id: true,
      shop_code: true,
      shop_name: true,
      address: true,
      city: true,
      pincode: true,
      state_code: true,
      phone: true,
      email: true,
    },
  },
  customer: {
    select: {
      customer_id: true,
      name: true,
      mobile: true,
      loyalty_tier: true,
      gst_number: true,
      address: true,
      city: true,
      state_code: true,
      pincode: true,
    },
  },
  bank_account: {
    select: {
      bank_account_id: true,
      account_holder_name: true,
      bank_name: true,
      branch_name: true,
      account_number: true,
      ifsc_code: true,
      upi_id: true,
    },
  },
  gst_config: {
    select: {
      gst_config_id: true,
      gst_number: true,
      legal_name: true,
    },
  },
  items: {
    select: {
      line_id: true,
      variant_id: true,
      product_id: true,
      manual_item_name: true,
      quantity: true,
      unit_price: true,
      mrp_unit_price: true,
      price_type: true,
      gst_percent: true,
      gst_type: true,
      hsn_code: true,
      line_subtotal: true,
      discount: true,
      taxable_amount: true,
      tax_amount: true,
      line_total: true,
      variant: {
        select: {
          variant_id: true,
          sku: true,
          mrp: true,
          warranty: true,
          product_code: true,
          product: { select: { product_id: true, name: true, brand_name: true, warranty: true } },
        },
      },
      product: { select: { product_id: true, name: true, brand_name: true, warranty: true } },
    },
  },
  payments: {
    select: {
      payment_id: true,
      amount: true,
      payment_method: true,
      reference_no: true,
      paid_at: true,
      collector: { select: { user_id: true, name: true } },
    },
    orderBy: { paid_at: 'asc' },
  },
};

const assertShopActive = async (shopId) => {
  const shop = await prisma.shop.findUnique({
    where: { shop_id: shopId },
    select: {
      shop_id: true,
      is_active: true,
      shop_name: true,
      address: true,
      city: true,
      pincode: true,
      state_code: true,
      phone: true,
      shop_type: true,
    },
  });
  if (!shop) throw new AppError('Shop not found', 404, 'SHOP_NOT_FOUND');
  if (!shop.is_active) throw new AppError('Shop is inactive', 409, 'SHOP_INACTIVE');
  return shop;
};

const loadVariantsForBill = async (items) => {
  const variantIds = [...new Set(items.map((i) => i.variant_id))];
  const variants = await prisma.productVariant.findMany({
    where: { variant_id: { in: variantIds } },
    select: {
      variant_id: true,
      product_id: true,
      sku: true,
      mrp: true,
      is_active: true,
      low_stock_threshold: true,
      product: {
        select: {
          product_id: true,
          name: true,
          hsn_code: true,
          gst_percent: true,
          gst_type: true,
          is_active: true,
        },
      },
    },
  });

  const map = new Map(variants.map((v) => [v.variant_id, v]));
  for (const item of items) {
    const variant = map.get(item.variant_id);
    if (!variant || !variant.is_active || !variant.product.is_active) {
      throw new AppError(`Variant not found: ${item.variant_id}`, 404, 'VARIANT_NOT_FOUND');
    }
  }
  return map;
};

const BillingService = {
  /**
   * Create a bill, deduct stock, write ledger, update customer.
   */
  async createBill(data, user) {
    try {
      const shopId = await resolveBillingShopId(user, data.shop_id);
      await assertBillWriteAccess(shopId, user);
      const shop = await assertShopActive(shopId);

      if (!Array.isArray(data.items) || !data.items.length) {
        throw new AppError('At least one bill item is required', 400, 'ITEMS_REQUIRED');
      }

      const billType = data.bill_type || 'GST_INVOICE';
      if (billType === 'NON_LISTED_BILL' && shop.shop_type === 'FRANCHISE') {
        throw new AppError(
          'Non-listed bills are not allowed for franchise shops',
          403,
          'NON_LISTED_NOT_ALLOWED_FOR_FRANCHISE'
        );
      }

      let customer = null;
      if (data.customer_id) {
        customer = await prisma.customer.findUnique({
          where: { customer_id: data.customer_id },
        });
        if (!customer || !customer.is_active) {
          throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
        }
      }

      // ── NON_LISTED_BILL: handle separately (manual items, no inventory) ──
      if (billType === 'NON_LISTED_BILL') {
        return await BillingService._createNonListedBill(data, user, shopId, shop, customer);
      }

      const variantMap = await loadVariantsForBill(data.items);

      let customerGstin = null;
      let companyNameSnapshot = null;

      if (billType === 'GST_INVOICE') {
        const gstNum = (data.customer_gstin || data.gst_number || customer?.gst_number || '').trim().toUpperCase();
        const companyName = (data.company_name || customer?.company_name || '').trim();
        const address = (data.address || customer?.address || '').trim();
        const city = (data.city || customer?.city || '').trim();
        const stateCode = (data.state_code || customer?.state_code || '').trim();
        const pincode = (data.pincode || customer?.pincode || '').trim();

        if (!companyName) throw new AppError('company_name is required for GST Invoice', 400, 'COMPANY_NAME_REQUIRED');
        if (!gstNum) throw new AppError('gst_number is required for GST Invoice', 400, 'GST_NUMBER_REQUIRED');
        if (gstNum.length !== 15) throw new AppError('GST number must be 15 characters', 400, 'INVALID_GST_NUMBER');
        const { GST_NUMBER_REGEX } = require('../../utils/customer.utils');
        if (!GST_NUMBER_REGEX.test(gstNum)) {
          throw new AppError('GST number format is invalid', 400, 'INVALID_GST_NUMBER');
        }

        if (!address) throw new AppError('address is required for GST Invoice', 400, 'ADDRESS_REQUIRED');
        if (!city) throw new AppError('city is required for GST Invoice', 400, 'CITY_REQUIRED');
        if (!stateCode) throw new AppError('state_code is required for GST Invoice', 400, 'STATE_CODE_REQUIRED');
        if (!/^\d{2}$/.test(stateCode)) throw new AppError('state_code must be 2 digits', 400, 'INVALID_STATE_CODE');
        if (!pincode) throw new AppError('pincode is required for GST Invoice', 400, 'PINCODE_REQUIRED');
        if (!/^\d{6}$/.test(pincode)) throw new AppError('pincode must be 6 digits', 400, 'INVALID_PINCODE');

        customerGstin = gstNum;
        companyNameSnapshot = companyName;
      }

      const loyaltyDiscountPercent = customer
        ? await CustomerService.getCustomerDiscountPercent(customer.customer_id)
        : 0;
      const extraDiscountAmount = parseExtraDiscountAmount(data);

      const shopStateCode = normalizeStateCode(shop.state_code);
      if (
        !shopStateCode &&
        (billType === 'GST_INVOICE' || billType === 'NON_GST_INVOICE')
      ) {
        throw new AppError(
          'Shop state is not configured. Ask admin to set state on the shop record.',
          400,
          'SHOP_STATE_REQUIRED'
        );
      }

      const placeOfSupplyStateCode = resolvePlaceOfSupplyStateCode({
        customerStateCode: billType === 'GST_INVOICE'
          ? (data.state_code || customer?.state_code)
          : customer?.state_code,
        customerGstin,
        overrideCode: data.place_of_supply_state_code,
        shopStateCode,
      });

      const computedLines = data.items.map((item) => {
        const variant = variantMap.get(item.variant_id);
        const qty = Number(item.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new AppError('Item quantity must be a positive integer', 400, 'TRANSFER_QUANTITY_INVALID');
        }
        const unitPrice = Number(item.unit_price);
        if (Number.isNaN(unitPrice) || unitPrice < 0) {
          throw new AppError('unit_price must be >= 0', 400, 'INVALID_UNIT_PRICE');
        }

        const lineGstType =
          billType === 'GST_INVOICE'
            ? normalizeProductGstType(variant.product.gst_type)
            : variant.product.gst_type;

        const amounts = calculateLineAmounts({
          quantity: qty,
          unitPrice,
          gstPercent: variant.product.gst_percent,
          gstType: lineGstType,
          billType,
          lineDiscount: Number(item.discount) || 0,
        });

        return {
          variant_id: variant.variant_id,
          product_id: variant.product_id,
          quantity: qty,
          unit_price: unitPrice,
          mrp_unit_price: Number(variant.mrp) || unitPrice,
          price_type: item.price_type || 'SPECIAL',
          gst_percent: variant.product.gst_percent,
          gst_type: amounts.gst_type,
          hsn_code: variant.product.hsn_code,
          product_name: variant.product.name,
          low_stock_threshold: variant.low_stock_threshold,
          ...amounts,
        };
      });

      const totals = computeBillTotals(computedLines, {
        loyaltyDiscountPercent,
        extraDiscountAmount,
      });
      const creditNoteIds = Array.isArray(data.credit_note_ids)
        ? [...new Set(data.credit_note_ids)]
        : [];

      const paymentAmount = data.payment_amount != null ? roundMoney(data.payment_amount) : 0;
      if (paymentAmount > 0 && !data.payment_method) {
        throw new AppError('payment_method is required when payment_amount is provided', 400, 'PAYMENT_METHOD_REQUIRED');
      }

      if (data.payment_method === 'UPI' && paymentAmount > 0) {
        if (!data.bank_account_id) {
          throw new AppError('bank_account_id is required for UPI payments', 400, 'BANK_ACCOUNT_REQUIRED');
        }
        await ShopBankAccountService.assertBankAccountForBilling(data.bank_account_id, shopId, {
          requireUpi: true,
        });
      } else if (data.bank_account_id) {
        await ShopBankAccountService.assertBankAccountForBilling(data.bank_account_id, shopId, {
          requireUpi: false,
        });
      }

      let gstConfigId = data.gst_config_id ?? null;
      if (billType === 'GST_INVOICE') {
        if (!gstConfigId) {
          const defaultGst = await prisma.shopGstRegistration.findFirst({
            where: { shop_id: shopId, is_default: true, is_active: true },
            select: { gst_config_id: true },
          });
          if (!defaultGst) {
            throw new AppError(
              'Please add shop GSTIN from Shop Settings to generate GST invoices',
              400,
              'SHOP_GST_REQUIRED'
            );
          }
          gstConfigId = defaultGst.gst_config_id;
        }
      }

      const activeStaffCount = await ShopStaffCodeService.countActiveForShop(shopId);
      let staffSnapshot = null;
      if (activeStaffCount > 0) {
        if (!data.staff_code_id) {
          throw new AppError(
            'staff_code_id is required — select billing staff code before creating bill',
            400,
            'STAFF_CODE_REQUIRED'
          );
        }
        staffSnapshot = await ShopStaffCodeService.resolveForBilling(data.staff_code_id, shopId);
      } else if (data.staff_code_id) {
        staffSnapshot = await ShopStaffCodeService.resolveForBilling(data.staff_code_id, shopId);
      }

      const result = await prisma.$transaction(async (tx) => {
        for (const line of computedLines) {
          await ShopStockService.deductStockForSale(tx, shopId, line.variant_id, line.quantity);
        }

        const billNumber = await generateBillNumber(shopId, tx);

        if (billType === 'GST_INVOICE' && customer && (data.save_gst_to_customer === true || data.save_to_customer === true || data.saveToCustomer === true)) {
          const gstNum = (data.customer_gstin || data.gst_number || customer?.gst_number || '').trim().toUpperCase();
          const companyName = (data.company_name || customer?.company_name || '').trim();
          const address = (data.address || customer?.address || '').trim();
          const city = (data.city || customer?.city || '').trim();
          const stateCode = (data.state_code || customer?.state_code || '').trim();
          const pincode = (data.pincode || customer?.pincode || '').trim();

          await tx.customer.update({
            where: { customer_id: customer.customer_id },
            data: {
              is_gst_registered: true,
              gst_number: gstNum,
              company_name: companyName,
              address,
              city,
              state_code: normalizeStateCode(stateCode),
              pincode,
            },
          });
        }

        const bill = await tx.bill.create({
          data: {
            bill_number: billNumber,
            shop_id: shopId,
            customer_id: customer?.customer_id ?? null,
            bill_type: billType,
            customer_mobile: customer?.mobile ?? data.customer_mobile?.trim() ?? null,
            customer_name: billType === 'GST_INVOICE'
              ? (companyNameSnapshot || customer?.company_name || customer?.name || data.customer_name?.trim() || null)
              : (customer?.name || data.customer_name?.trim() || null),
            customer_gstin: customerGstin,
            place_of_supply_state_code: placeOfSupplyStateCode,
            subtotal: totals.subtotal,
            discount: totals.discount,
            taxable_amount: totals.taxable_amount,
            gst_amount: totals.gst_amount,
            total_amount: totals.total_amount,
            payment_status: 'PENDING',
            payment_method: null,
            paid_amount: 0,
            balance_amount: totals.total_amount,
            gst_config_id: gstConfigId,
            bank_account_id: data.bank_account_id ?? null,
            sales_channel: data.sales_channel || 'WALK_IN',
            created_by_user_id: user.userId,
            staff_code_id: staffSnapshot?.staff_code_id ?? null,
            staff_code_value: staffSnapshot?.staff_code_value ?? null,
            staff_name_snapshot: staffSnapshot?.staff_name_snapshot ?? null,
            items: {
              create: computedLines.map((line) => ({
                variant_id: line.variant_id,
                product_id: line.product_id,
                quantity: line.quantity,
                unit_price: line.unit_price,
                mrp_unit_price: line.mrp_unit_price,
                price_type: line.price_type,
                gst_percent: line.gst_percent,
                gst_type: line.gst_type,
                hsn_code: line.hsn_code,
                line_subtotal: line.line_subtotal,
                discount: line.discount,
                taxable_amount: line.taxable_amount,
                tax_amount: line.tax_amount,
                line_total: line.line_total,
              })),
            },
          },
          select: BILL_SELECT,
        });

        let creditApplied = 0;
        let creditAllocations = [];
        if (creditNoteIds.length) {
          const redemption = await CreditNoteService.applyCreditNotesOnBill(tx, {
            creditNoteIds,
            shopId,
            billId: bill.bill_id,
            billTotal: totals.total_amount,
            customerId: customer?.customer_id ?? null,
            customerMobile: customer?.mobile ?? data.customer_mobile?.trim() ?? null,
            userId: user.userId,
          });
          creditApplied = redemption.creditApplied;
          creditAllocations = redemption.allocations ?? [];
        }

        const finalTotal = roundMoney(Math.max(0, totals.total_amount - creditApplied));
        const paidAmount =
          paymentAmount > 0 ? Math.min(paymentAmount, finalTotal) : 0;
        const balanceAmount = roundMoney(finalTotal - paidAmount);
        const paymentStatus =
          finalTotal <= 0 ? 'PAID' : derivePaymentStatus(finalTotal, paidAmount);

        const billAfterCredit =
          creditApplied > 0
            ? await tx.bill.update({
                where: { bill_id: bill.bill_id },
                data: {
                  total_amount: finalTotal,
                  balance_amount: balanceAmount,
                  paid_amount: paidAmount,
                  payment_status: paymentStatus,
                  payment_method: paidAmount > 0 ? data.payment_method || null : null,
                  discount: totals.discount,
                },
                select: BILL_SELECT,
              })
            : await tx.bill.update({
                where: { bill_id: bill.bill_id },
                data: {
                  paid_amount: paidAmount,
                  balance_amount: balanceAmount,
                  payment_status: paymentStatus,
                  payment_method: paidAmount > 0 ? data.payment_method || null : null,
                },
                select: BILL_SELECT,
              });

        for (const line of computedLines) {
          await createStockLedgerEntry(tx, {
            productId: line.product_id,
            variantId: line.variant_id,
            movementType: 'SALES',
            quantity: line.quantity,
            fromShopId: shopId,
            referenceId: billAfterCredit.bill_id,
            referenceType: 'BILL',
            createdBy: user.userId,
            remarks: `Sale of ${line.quantity} units of ${line.product_name}`,
          });
        }

        if (customer?.customer_id && finalTotal > 0) {
          await CustomerService.updateCustomerSpend(customer.customer_id, finalTotal, tx);
        }

        if (paidAmount > 0 && data.payment_method) {
          await tx.billPayment.create({
            data: {
              bill_id: billAfterCredit.bill_id,
              amount: paidAmount,
              payment_method: data.payment_method,
              reference_no: data.reference_no?.trim() || null,
              collected_by: user.userId,
            },
          });
        }

        const lineTaxSum = roundMoney(
          computedLines.reduce((sum, l) => sum + l.tax_amount, 0)
        );
        const taxScale =
          lineTaxSum > 0 ? billAfterCredit.gst_amount / lineTaxSum : 0;
        const summaryLines = computedLines.map((line) => ({
          gst_type: line.gst_type,
          tax_amount: roundMoney(line.tax_amount * taxScale),
        }));
        const taxSummary =
          billType === 'GST_INVOICE'
            ? buildTaxSummaryFromLines(summaryLines)
            : { tax_mode: 'EXEMPT', is_intra_state: true, cgst: 0, sgst: 0, igst: 0 };

        return {
          ...billAfterCredit,
          credit_applied: creditApplied,
          credit_notes_applied: creditAllocations,
          tax_summary: taxSummary,
        };
      }, TX_OPTIONS);

      logger.info('Bill created', {
        bill_id: result.bill_id,
        bill_number: result.bill_number,
        shop_id: shopId,
        total: result.total_amount,
        credit_applied: result.credit_applied ?? 0,
        user_id: user.userId,
      });

      return {
        ...result,
        public_invoice_token: _generatePublicToken(result.bill_id),
      };
    } catch (err) {
      logger.error('createBill failed', { error: err.message, stack: err.stack, user_id: user.userId });
      throw err;
    }
  },

  /**
   * Create a NON_LISTED_BILL — manual items only, no inventory link, no stock deduction.
   */
  async _createNonListedBill(data, user, shopId, shop, customer) {
    if (!Array.isArray(data.items) || !data.items.length) {
      throw new AppError('At least one item is required', 400, 'ITEMS_REQUIRED');
    }

    // Validate each manual item
    for (const item of data.items) {
      const name = (item.item_name || '').trim();
      if (!name) throw new AppError('item_name is required for each Non-Listed Bill item', 400, 'ITEM_NAME_REQUIRED');
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty <= 0) throw new AppError('quantity must be a positive integer', 400, 'TRANSFER_QUANTITY_INVALID');
      const price = Number(item.unit_price);
      if (Number.isNaN(price) || price < 0) throw new AppError('unit_price must be >= 0', 400, 'INVALID_UNIT_PRICE');
    }

    const extraDiscountAmount = parseExtraDiscountAmount(data);
    const paymentAmount = data.payment_amount != null ? roundMoney(data.payment_amount) : 0;

    if (paymentAmount > 0 && !data.payment_method) {
      throw new AppError('payment_method is required when payment_amount is provided', 400, 'PAYMENT_METHOD_REQUIRED');
    }

    const activeStaffCount = await ShopStaffCodeService.countActiveForShop(shopId);
    let staffSnapshot = null;
    if (activeStaffCount > 0) {
      if (!data.staff_code_id) {
        throw new AppError(
          'staff_code_id is required — select billing staff code before creating bill',
          400,
          'STAFF_CODE_REQUIRED'
        );
      }
      staffSnapshot = await ShopStaffCodeService.resolveForBilling(data.staff_code_id, shopId);
    } else if (data.staff_code_id) {
      staffSnapshot = await ShopStaffCodeService.resolveForBilling(data.staff_code_id, shopId);
    }

    // Build computed lines (no GST, simple subtotals)
    const computedLines = data.items.map((item) => {
      const qty = Number(item.quantity);
      const unitPrice = roundMoney(Number(item.unit_price));
      const mrpUnitPrice = item.mrp != null ? roundMoney(Number(item.mrp)) : unitPrice;
      const lineSubtotal = roundMoney(unitPrice * qty);
      return {
        manual_item_name: (item.item_name || '').trim(),
        quantity: qty,
        unit_price: unitPrice,
        mrp_unit_price: mrpUnitPrice,
        price_type: 'SPECIAL',
        gst_percent: 0,
        gst_type: 'EXEMPT',
        hsn_code: '',
        line_subtotal: lineSubtotal,
        discount: 0,
        taxable_amount: lineSubtotal,
        tax_amount: 0,
        line_total: lineSubtotal,
      };
    });

    // Simple total (no loyalty discount, no GST); extra discount after gross
    const subtotal = roundMoney(computedLines.reduce((s, l) => s + l.line_subtotal, 0));
    const extraDiscount = roundMoney(Math.min(extraDiscountAmount, subtotal));
    const taxableAmount = subtotal;
    const totalAmount = roundMoney(Math.max(0, subtotal - extraDiscount));

    const creditNoteIds = Array.isArray(data.credit_note_ids) ? [...new Set(data.credit_note_ids)] : [];
    const paidAmount = paymentAmount > 0 ? Math.min(paymentAmount, totalAmount) : 0;
    const balanceAmount = roundMoney(totalAmount - paidAmount);
    const paymentStatus = derivePaymentStatus(totalAmount, paidAmount);

    const result = await prisma.$transaction(async (tx) => {
      const billNumber = await generateBillNumber(shopId, tx);

      const bill = await tx.bill.create({
        data: {
          bill_number: billNumber,
          shop_id: shopId,
          customer_id: customer?.customer_id ?? null,
          bill_type: 'NON_LISTED_BILL',
          customer_mobile: customer?.mobile ?? data.customer_mobile?.trim() ?? null,
          customer_name: customer?.name ?? data.customer_name?.trim() ?? null,
          customer_gstin: null,
          subtotal,
          discount: extraDiscount,
          taxable_amount: taxableAmount,
          gst_amount: 0,
          total_amount: totalAmount,
          payment_status: paymentStatus,
          payment_method: paidAmount > 0 ? data.payment_method || null : null,
          paid_amount: paidAmount,
          balance_amount: balanceAmount,
          gst_config_id: null,
          bank_account_id: data.bank_account_id ?? null,
          sales_channel: data.sales_channel || 'WALK_IN',
          created_by_user_id: user.userId,
          staff_code_id: staffSnapshot?.staff_code_id ?? null,
          staff_code_value: staffSnapshot?.staff_code_value ?? null,
          staff_name_snapshot: staffSnapshot?.staff_name_snapshot ?? null,
          items: {
            create: computedLines.map((line) => ({
              variant_id: null,
              product_id: null,
              manual_item_name: line.manual_item_name,
              quantity: line.quantity,
              unit_price: line.unit_price,
              mrp_unit_price: line.mrp_unit_price,
              price_type: line.price_type,
              gst_percent: line.gst_percent,
              gst_type: line.gst_type,
              hsn_code: line.hsn_code,
              line_subtotal: line.line_subtotal,
              discount: line.discount,
              taxable_amount: line.taxable_amount,
              tax_amount: line.tax_amount,
              line_total: line.line_total,
            })),
          },
        },
        select: BILL_SELECT,
      });

      // ── Apply credit notes (same logic as regular bills) ──
      let creditApplied = 0;
      let creditAllocations = [];
      if (creditNoteIds.length) {
        const redemption = await CreditNoteService.applyCreditNotesOnBill(tx, {
          creditNoteIds,
          shopId,
          billId: bill.bill_id,
          billTotal: totalAmount,
          customerId: customer?.customer_id ?? null,
          customerMobile: customer?.mobile ?? data.customer_mobile?.trim() ?? null,
          userId: user.userId,
        });
        creditApplied = redemption.creditApplied;
        creditAllocations = redemption.allocations ?? [];
      }

      const finalTotal = roundMoney(Math.max(0, totalAmount - creditApplied));
      const finalPaidAmount = paymentAmount > 0 ? Math.min(paymentAmount, finalTotal) : 0;
      const finalBalanceAmount = roundMoney(finalTotal - finalPaidAmount);
      const finalPaymentStatus =
        finalTotal <= 0 ? 'PAID' : derivePaymentStatus(finalTotal, finalPaidAmount);

      const billAfterCredit =
        creditApplied > 0
          ? await tx.bill.update({
              where: { bill_id: bill.bill_id },
              data: {
                total_amount: finalTotal,
                balance_amount: finalBalanceAmount,
                paid_amount: finalPaidAmount,
                payment_status: finalPaymentStatus,
                payment_method: finalPaidAmount > 0 ? data.payment_method || null : null,
                discount: extraDiscount,
              },
              select: BILL_SELECT,
            })
          : await tx.bill.update({
              where: { bill_id: bill.bill_id },
              data: {
                paid_amount: finalPaidAmount,
                balance_amount: finalBalanceAmount,
                payment_status: finalPaymentStatus,
                payment_method: finalPaidAmount > 0 ? data.payment_method || null : null,
              },
              select: BILL_SELECT,
            });

      if (finalPaidAmount > 0 && data.payment_method) {
        await tx.billPayment.create({
          data: {
            bill_id: billAfterCredit.bill_id,
            amount: finalPaidAmount,
            payment_method: data.payment_method,
            reference_no: data.reference_no?.trim() || null,
            collected_by: user.userId,
          },
        });
      }

      if (customer?.customer_id && finalTotal > 0) {
        await CustomerService.updateCustomerSpend(customer.customer_id, finalTotal, tx);
      }

      return { ...billAfterCredit, credit_applied: creditApplied, credit_notes_applied: creditAllocations, tax_summary: { tax_mode: 'EXEMPT', is_intra_state: true, cgst: 0, sgst: 0, igst: 0 } };
    }, TX_OPTIONS);

    logger.info('NON_LISTED_BILL created', {
      bill_id: result.bill_id,
      bill_number: result.bill_number,
      shop_id: shopId,
      total: result.total_amount,
      user_id: user.userId,
    });

    return {
      ...result,
      public_invoice_token: _generatePublicToken(result.bill_id),
    };
  },

  async getBillById(billId, user) {
    const bill = await prisma.bill.findUnique({ where: { bill_id: billId }, select: BILL_SELECT });
    if (!bill) throw new AppError('Bill not found', 404, 'BILL_NOT_FOUND');
    await assertBillReadAccess(bill.shop_id, user);
    const tax_summary =
      bill.bill_type === 'GST_INVOICE'
        ? buildTaxSummaryFromLines(bill.items)
        : { tax_mode: 'EXEMPT', is_intra_state: true, cgst: 0, sgst: 0, igst: 0 };
    return {
      ...bill,
      tax_summary,
      public_invoice_token: _generatePublicToken(bill.bill_id),
    };
  },

  async listBills(filters, user) {
    const { page, limit, skip, take } = parsePagination(filters, { page: 1, limit: 20, maxLimit: 100 });
    const where = await applyBillListScope({}, user);

    if (filters.shop_id) {
      const shopId = await resolveBillingShopId(user, filters.shop_id);
      where.shop_id = shopId;
    }

    if (filters.customer_id) where.customer_id = filters.customer_id;
    if (filters.customer_mobile) where.customer_mobile = { contains: String(filters.customer_mobile).trim() };
    if (filters.bill_number) where.bill_number = { contains: String(filters.bill_number).trim(), mode: 'insensitive' };
    if (filters.payment_status) where.payment_status = filters.payment_status;
    if (filters.is_cancelled != null) {
      where.is_cancelled = filters.is_cancelled === true || filters.is_cancelled === 'true';
    }
    if (filters.exclude_non_listed === true || filters.exclude_non_listed === 'true') {
      where.bill_type = { not: 'NON_LISTED_BILL' };
    }

    if (filters.from_date || filters.to_date) {
      where.created_at = {};
      if (filters.from_date) where.created_at.gte = new Date(filters.from_date);
      if (filters.to_date) {
        const end = new Date(filters.to_date);
        end.setHours(23, 59, 59, 999);
        where.created_at.lte = end;
      }
    }

    const [total, bills] = await Promise.all([
      prisma.bill.count({ where }),
      prisma.bill.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: BILL_SELECT,
      }),
    ]);

    return { total, page, limit, bills };
  },

  async addPayment(billId, data, user) {
    try {
      const bill = await prisma.bill.findUnique({
        where: { bill_id: billId },
        select: { bill_id: true, shop_id: true, is_cancelled: true, total_amount: true, paid_amount: true },
      });
      if (!bill) throw new AppError('Bill not found', 404, 'BILL_NOT_FOUND');
      if (bill.is_cancelled) throw new AppError('Cannot add payment to a cancelled bill', 409, 'BILL_ALREADY_CANCELLED');

      await assertBillWriteAccess(bill.shop_id, user);

      const amount = roundMoney(data.amount);
      if (amount <= 0) throw new AppError('Payment amount must be greater than zero', 400, 'INVALID_PAYMENT_AMOUNT');

      const updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.bill.findUnique({ where: { bill_id: billId } });
        if (locked.is_cancelled) throw new AppError('Bill is cancelled', 409, 'BILL_ALREADY_CANCELLED');

        const newPaid = roundMoney(locked.paid_amount + amount);
        if (newPaid > locked.total_amount + 0.01) {
          throw new AppError(
            `Payment exceeds bill balance. Balance: ${roundMoney(locked.total_amount - locked.paid_amount)}`,
            409,
            'PAYMENT_EXCEEDS_BALANCE'
          );
        }

        await tx.billPayment.create({
          data: {
            bill_id: billId,
            amount,
            payment_method: data.payment_method,
            reference_no: data.reference_no?.trim() || null,
            collected_by: user.userId,
          },
        });

        const paidAmount = Math.min(newPaid, locked.total_amount);
        const balanceAmount = roundMoney(locked.total_amount - paidAmount);
        const paymentStatus = derivePaymentStatus(locked.total_amount, paidAmount);

        return tx.bill.update({
          where: { bill_id: billId },
          data: {
            paid_amount: paidAmount,
            balance_amount: balanceAmount,
            payment_status: paymentStatus,
            payment_method: data.payment_method,
          },
          select: BILL_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Bill payment added', { bill_id: billId, amount, user_id: user.userId });
      return updated;
    } catch (err) {
      logger.error('addPayment failed', { billId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  async cancelBill(billId, data, user) {
    try {
      const existing = await prisma.bill.findUnique({
        where: { bill_id: billId },
        include: {
          items: {
            select: {
              line_id: true,
              variant_id: true,
              product_id: true,
              quantity: true,
              variant: { select: { low_stock_threshold: true, product: { select: { name: true } } } },
            },
          },
        },
      });

      if (!existing) throw new AppError('Bill not found', 404, 'BILL_NOT_FOUND');
      if (existing.is_cancelled) throw new AppError('Bill is already cancelled', 409, 'BILL_ALREADY_CANCELLED');

      await assertBillWriteAccess(existing.shop_id, user);

      const updated = await prisma.$transaction(async (tx) => {
        const locked = await tx.bill.findUnique({
          where: { bill_id: billId },
          include: {
            items: {
              select: {
                variant_id: true,
                product_id: true,
                quantity: true,
                variant: { select: { low_stock_threshold: true, product: { select: { name: true } } } },
              },
            },
          },
        });

        if (locked.is_cancelled) throw new AppError('Bill is already cancelled', 409, 'BILL_ALREADY_CANCELLED');

        // NON_LISTED_BILL items have no inventory link — skip stock restore
        if (locked.bill_type !== 'NON_LISTED_BILL') {
          for (const item of locked.items) {
            if (!item.variant_id) continue; // safety guard
            await ShopStockService.restoreStockForSale(
              tx,
              locked.shop_id,
              item.variant_id,
              item.quantity,
              item.variant?.low_stock_threshold ?? 5
            );

            await createStockLedgerEntry(tx, {
              productId: item.product_id,
              variantId: item.variant_id,
              movementType: 'RETURN',
              quantity: item.quantity,
              toShopId: locked.shop_id,
              referenceId: locked.bill_id,
              referenceType: 'BILL_CANCELLATION',
              createdBy: user.userId,
              remarks: `Bill cancellation — restore ${item.quantity} units of ${item.variant?.product?.name || 'product'}`,
            });
          }
        }

        if (locked.customer_id && locked.total_amount > 0) {
          await CustomerService.updateCustomerSpend(locked.customer_id, -locked.total_amount, tx);
        }

        return tx.bill.update({
          where: { bill_id: billId },
          data: {
            is_cancelled: true,
            cancelled_at: new Date(),
            cancelled_by_user_id: user.userId,
            cancel_reason: data.reason?.trim() || null,
            payment_status: 'CANCELLED',
          },
          select: BILL_SELECT,
        });
      }, TX_OPTIONS);

      logger.info('Bill cancelled', { bill_id: billId, user_id: user.userId });
      return updated;
    } catch (err) {
      logger.error('cancelBill failed', { billId, error: err.message, stack: err.stack });
      throw err;
    }
  },

  async getDailySummary(shopId, date, user) {
    const resolvedShopId = await resolveBillingShopId(user, shopId);
    await assertBillReadAccess(resolvedShopId, user);

    const day = date ? new Date(date) : new Date();
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const bills = await prisma.bill.findMany({
      where: {
        shop_id: resolvedShopId,
        is_cancelled: false,
        created_at: { gte: start, lt: end },
      },
      select: {
        total_amount: true,
        gst_amount: true,
        payment_method: true,
        payment_status: true,
        paid_amount: true,
        place_of_supply_state_code: true,
      },
    });

    const shop = await prisma.shop.findUnique({
      where: { shop_id: resolvedShopId },
      select: { state_code: true },
    });

    const summary = {
      shop_id: resolvedShopId,
      date: start.toISOString().slice(0, 10),
      bill_count: bills.length,
      total_amount: 0,
      total_gst: 0,
      total_collected: 0,
      payment_methods: {},
      gst: { cgst: 0, sgst: 0, igst: 0 },
    };

    for (const bill of bills) {
      summary.total_amount = roundMoney(summary.total_amount + bill.total_amount);
      summary.total_gst = roundMoney(summary.total_gst + bill.gst_amount);
      summary.total_collected = roundMoney(summary.total_collected + bill.paid_amount);

      const method = bill.payment_method || 'UNSPECIFIED';
      summary.payment_methods[method] = roundMoney((summary.payment_methods[method] || 0) + bill.paid_amount);

      const intra = isIntraStateSupply(shop?.state_code, bill.place_of_supply_state_code);
      const split = splitGstComponents(bill.gst_amount, intra);
      summary.gst.cgst = roundMoney(summary.gst.cgst + split.cgst);
      summary.gst.sgst = roundMoney(summary.gst.sgst + split.sgst);
      summary.gst.igst = roundMoney(summary.gst.igst + split.igst);
    }

    return summary;
  },

  async getGSTReport(shopId, fromDate, toDate, user) {
    const resolvedShopId = await resolveBillingShopId(user, shopId);
    await assertBillReadAccess(resolvedShopId, user);

    const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    const shop = await prisma.shop.findUnique({
      where: { shop_id: resolvedShopId },
      select: { state_code: true, shop_name: true },
    });

    const items = await prisma.billLineItem.findMany({
      where: {
        bill: {
          shop_id: resolvedShopId,
          is_cancelled: false,
          created_at: { gte: start, lte: end },
        },
      },
      select: {
        hsn_code: true,
        gst_percent: true,
        taxable_amount: true,
        tax_amount: true,
        bill: { select: { place_of_supply_state_code: true, gst_amount: true } },
      },
    });

    const hsnMap = new Map();
    let totals = { taxable_value: 0, tax_amount: 0, cgst: 0, sgst: 0, igst: 0 };

    for (const row of items) {
      const key = `${row.hsn_code}|${row.gst_percent}`;
      if (!hsnMap.has(key)) {
        hsnMap.set(key, {
          hsn_code: row.hsn_code,
          gst_percent: row.gst_percent,
          taxable_value: 0,
          tax_amount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        });
      }
      const entry = hsnMap.get(key);
      entry.taxable_value = roundMoney(entry.taxable_value + row.taxable_amount);
      entry.tax_amount = roundMoney(entry.tax_amount + row.tax_amount);

      const intra = isIntraStateSupply(shop?.state_code, row.bill.place_of_supply_state_code);
      const split = splitGstComponents(row.tax_amount, intra);
      entry.cgst = roundMoney(entry.cgst + split.cgst);
      entry.sgst = roundMoney(entry.sgst + split.sgst);
      entry.igst = roundMoney(entry.igst + split.igst);

      totals.taxable_value = roundMoney(totals.taxable_value + row.taxable_amount);
      totals.tax_amount = roundMoney(totals.tax_amount + row.tax_amount);
      totals.cgst = roundMoney(totals.cgst + split.cgst);
      totals.sgst = roundMoney(totals.sgst + split.sgst);
      totals.igst = roundMoney(totals.igst + split.igst);
    }

    return {
      shop_id: resolvedShopId,
      shop_name: shop?.shop_name,
      from_date: start.toISOString().slice(0, 10),
      to_date: new Date(toDate).toISOString().slice(0, 10),
      hsn_summary: [...hsnMap.values()],
      totals,
    };
  },

  async generatePDF(billId, user, { persist = true, printFormat = 'A4' } = {}) {
    const bill = await this.getBillById(billId, user);

    if (bill.bill_type === 'GST_INVOICE' && !bill.bank_account) {
      const defaultBank = await ShopBankAccountService.resolveDefaultForGstInvoice(
        bill.shop_id,
        bill.gst_config_id
      );
      if (defaultBank) bill.bank_account = defaultBank;
    }

    const pdf = await generateBillPdf(bill, { persist, printFormat });

    if (pdf.pdf_storage_key && persist) {
      await prisma.bill.update({
        where: { bill_id: billId },
        data: { pdf_storage_key: pdf.pdf_storage_key },
      });
    }

    return { bill, pdf };
  },

  async generatePublicPDF(billId, { printFormat = 'A4' } = {}) {
    const bill = await prisma.bill.findUnique({ where: { bill_id: billId }, select: BILL_SELECT });
    if (!bill) throw new AppError('Bill not found', 404, 'BILL_NOT_FOUND');

    const tax_summary =
      bill.bill_type === 'GST_INVOICE'
        ? buildTaxSummaryFromLines(bill.items)
        : { tax_mode: 'EXEMPT', is_intra_state: true, cgst: 0, sgst: 0, igst: 0 };
        
    const enrichedBill = { ...bill, tax_summary };

    if (enrichedBill.bill_type === 'GST_INVOICE' && !enrichedBill.bank_account) {
      const defaultBank = await ShopBankAccountService.resolveDefaultForGstInvoice(
        enrichedBill.shop_id,
        enrichedBill.gst_config_id
      );
      if (defaultBank) enrichedBill.bank_account = defaultBank;
    }

    const pdf = await generateBillPdf(enrichedBill, { persist: false, printFormat });

    return { bill: enrichedBill, pdf };
  },
};

module.exports = BillingService;
