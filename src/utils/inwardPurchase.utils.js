const prisma = require('./prisma.utils');
const { AppError } = require('../errors/AppError');
const { calculatePurchaseLineTax, aggregatePurchaseTotals } = require('./purchaseTax.utils');
const { resolveVariantForInwardItem } = require('./inwardVariantMapping.utils');

/**
 * Block duplicate vendor invoice for the same vendor when completing GRN.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
const assertVendorInvoiceNotDuplicate = async (tx, { vendorId, vendorInvoiceNo, inwardId }) => {
  const invoice = vendorInvoiceNo?.trim();
  if (!invoice) return;

  const existingPurchase = await tx.purchaseEntry.findFirst({
    where: {
      vendor_id: vendorId,
      vendor_invoice_no: invoice,
    },
    select: { purchase_id: true, purchase_number: true },
  });

  if (existingPurchase) {
    throw new AppError(
      `Vendor invoice ${invoice} is already recorded on purchase ${existingPurchase.purchase_number}`,
      409,
      'DUPLICATE_VENDOR_INVOICE',
      { purchase_id: existingPurchase.purchase_id }
    );
  }

  const otherInward = await tx.inwardReceipt.findFirst({
    where: {
      vendor_id: vendorId,
      vendor_invoice_no: invoice,
      inward_id: { not: inwardId },
      status: { not: 'CANCELLED' },
    },
    select: { inward_id: true, inward_number: true },
  });

  if (otherInward) {
    throw new AppError(
      `Vendor invoice ${invoice} is already used on inward ${otherInward.inward_number}`,
      409,
      'DUPLICATE_VENDOR_INVOICE',
      { inward_id: otherInward.inward_id }
    );
  }
};

/**
 * Resolve default variant for a product (for purchase line tax + variant_id).
 */
const resolveDefaultVariantForProduct = async (tx, productId) =>
  tx.productVariant.findFirst({
    where: { product_id: productId, is_active: true },
    orderBy: [{ is_default: 'desc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    select: {
      variant_id: true,
      purchase_price: true,
      expenses: true,
      product: { select: { gst_percent: true, gst_type: true, expenses: true } },
    },
  });

/**
 * Build purchase lines from mapped inward items.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
const buildPurchaseLinesFromInwardItems = async (tx, inwardItems) => {
  const lines = [];

  for (const item of inwardItems) {
    if (!item.mapped_product_id) continue;

    const resolved = await resolveVariantForInwardItem(tx, item);
    const variant = await tx.productVariant.findUnique({
      where: { variant_id: resolved.variant_id },
      select: {
        variant_id: true,
        product: { select: { gst_percent: true, gst_type: true } },
      },
    });
    if (!variant) {
      throw new AppError(
        `Mapped variant not found for purchase: ${item.mapped_product_id}`,
        409,
        'MAPPED_PRODUCT_NO_VARIANT'
      );
    }

    const taxLine = calculatePurchaseLineTax({
      quantity: item.quantity_received,
      purchaseCost: item.purchase_cost || 0,
      gstPercent: variant.product.gst_percent,
      gstType: variant.product.gst_type,
    });

    lines.push({
      mapped_product_id: item.mapped_product_id,
      variant_id: variant.variant_id,
      quantity: item.quantity_received,
      purchase_cost: item.purchase_cost || 0,
      batch_number: item.batch_number,
      expiry_date: item.expiry_date,
      room_zone: item.room_zone,
      rack_shelf: item.rack_shelf,
      position: item.position,
      remarks: item.remarks,
      ...taxLine,
    });
  }

  return { lines, totals: aggregatePurchaseTotals(lines) };
};

module.exports = {
  assertVendorInvoiceNotDuplicate,
  buildPurchaseLinesFromInwardItems,
  resolveDefaultVariantForProduct,
};
