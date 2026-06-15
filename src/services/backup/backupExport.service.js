const prisma = require('../../utils/prisma.utils');
const { serializeRows } = require('../../utils/backup/backupSerialize.utils');
const {
  BACKUP_FORMAT_VERSION,
  BACKUP_APP_NAME,
  SCOPE_TYPE,
} = require('./backup.constants');

const unique = (arr) => [...new Set(arr.filter(Boolean))];

const stripUserSecrets = (users) =>
  users.map(({ password_hash, ...rest }) => ({
    ...rest,
    password_hash: null,
  }));

const attachReferencedUsers = async (collections) => {
  const userIds = new Set();

  for (const row of collections.bills || []) {
    if (row.created_by_user_id) userIds.add(row.created_by_user_id);
    if (row.cancelled_by_user_id) userIds.add(row.cancelled_by_user_id);
  }
  for (const row of collections.shops || []) {
    if (row.owner_user_id) userIds.add(row.owner_user_id);
  }
  for (const row of collections.purchase_entries || []) {
    if (row.received_by_user_id) userIds.add(row.received_by_user_id);
  }
  for (const row of collections.inward_receipts || []) {
    if (row.created_by_user_id) userIds.add(row.created_by_user_id);
    if (row.received_by_user_id) userIds.add(row.received_by_user_id);
  }
  for (const row of collections.transfer_requests || []) {
    ['requested_by', 'approved_by', 'dispatched_by', 'received_by', 'cancelled_by'].forEach((k) => {
      if (row[k]) userIds.add(row[k]);
    });
  }
  for (const row of collections.bulk_transfer_requests || []) {
    ['requested_by', 'approved_by', 'dispatched_by', 'received_by', 'cancelled_by'].forEach((k) => {
      if (row[k]) userIds.add(row[k]);
    });
  }
  for (const row of collections.vendor_payments || []) {
    if (row.paid_by_user_id) userIds.add(row.paid_by_user_id);
  }
  for (const row of collections.shop_expenses || []) {
    if (row.recorded_by_user_id) userIds.add(row.recorded_by_user_id);
  }
  for (const row of collections.warehouse_expenses || []) {
    if (row.recorded_by_user_id) userIds.add(row.recorded_by_user_id);
  }

  if (!userIds.size) return;

  const users = await prisma.user.findMany({
    where: { user_id: { in: [...userIds] } },
    select: {
      user_id: true,
      name: true,
      phone: true,
      role: true,
      warehouse_id: true,
      shop_id: true,
      is_active: true,
      remarks: true,
    },
  });

  collections.users = serializeRows(
    users.map((u) => ({ ...u, password_hash: null }))
  );
};

const loadReferencedMasterData = async (variantIds) => {
  const ids = unique(variantIds);
  if (!ids.length) {
    return {
      product_variants: [],
      products: [],
      categories: [],
      vendors: [],
      product_variant_images: [],
    };
  }

  const product_variants = await prisma.productVariant.findMany({
    where: { variant_id: { in: ids } },
  });

  const productIds = unique(product_variants.map((v) => v.product_id));
  const products = productIds.length
    ? await prisma.product.findMany({ where: { product_id: { in: productIds } } })
    : [];

  const categoryIds = unique(products.map((p) => p.category_id));
  const vendorIds = unique(products.map((p) => p.primary_vendor_id));

  const [categories, vendors, product_variant_images] = await Promise.all([
    categoryIds.length
      ? prisma.category.findMany({ where: { category_id: { in: categoryIds } } })
      : [],
    vendorIds.length
      ? prisma.vendor.findMany({ where: { vendor_id: { in: vendorIds } } })
      : [],
    prisma.productVariantImage.findMany({ where: { variant_id: { in: ids } } }),
  ]);

  return {
    product_variants,
    products,
    categories,
    vendors,
    product_variant_images,
  };
};

const buildManifest = (user, scope, collections, excelFileNames = []) => ({
  format_version: BACKUP_FORMAT_VERSION,
  app: BACKUP_APP_NAME,
  export_format: 'excel+json',
  created_at: new Date().toISOString(),
  created_by_user_id: user.userId,
  created_by_role: user.role,
  scope,
  collections: Object.keys(collections).filter((k) => Array.isArray(collections[k]) && collections[k].length > 0),
  excel_files: excelFileNames,
  restore_note: 'Use data/*.json files for system restore. Excel files are human-readable exports with names instead of IDs.',
});

const exportSystemScope = async (settings) => {
  const collections = {};

  const [
    categories,
    vendors,
    warehouses,
    shops,
    products,
    product_variants,
    product_variant_images,
    shop_gst_registrations,
    shop_bank_accounts,
    shop_staff_codes,
    customers,
    product_stocks,
    shop_stocks,
    shop_product_levels,
    purchase_entries,
    purchase_items,
    warehouse_expenses,
    shop_expenses,
    vendor_payments,
    vendor_payment_allocations,
    inward_receipts,
    inward_receipt_items,
    debit_notes,
    debit_note_line_items,
    bills,
    bill_line_items,
    bill_payments,
    credit_notes,
    credit_note_line_items,
    credit_note_redemptions,
    transfer_requests,
    bulk_transfer_requests,
    bulk_transfer_request_items,
    stock_ledgers,
    users,
  ] = await Promise.all([
    settings.include_products !== false ? prisma.category.findMany() : [],
    settings.include_products !== false ? prisma.vendor.findMany() : [],
    prisma.warehouse.findMany(),
    settings.include_settings !== false ? prisma.shop.findMany() : [],
    settings.include_products !== false ? prisma.product.findMany() : [],
    settings.include_products !== false ? prisma.productVariant.findMany() : [],
    settings.include_products !== false ? prisma.productVariantImage.findMany() : [],
    settings.include_settings !== false ? prisma.shopGstRegistration.findMany() : [],
    settings.include_settings !== false ? prisma.shopBankAccount.findMany() : [],
    settings.include_staff_codes !== false ? prisma.shopStaffCode.findMany() : [],
    settings.include_customers !== false ? prisma.customer.findMany() : [],
    settings.include_stock !== false ? prisma.productStock.findMany() : [],
    settings.include_stock !== false ? prisma.shopStock.findMany() : [],
    settings.include_stock !== false ? prisma.shopProductLevel.findMany() : [],
    prisma.purchaseEntry.findMany(),
    prisma.purchaseItem.findMany(),
    prisma.warehouseExpense.findMany(),
    prisma.shopExpense.findMany(),
    prisma.vendorPayment.findMany(),
    prisma.vendorPaymentAllocation.findMany(),
    prisma.inwardReceipt.findMany(),
    prisma.inwardReceiptItem.findMany(),
    prisma.debitNote.findMany(),
    prisma.debitNoteLineItem.findMany(),
    settings.include_bills !== false ? prisma.bill.findMany() : [],
    settings.include_bills !== false ? prisma.billLineItem.findMany() : [],
    settings.include_bills !== false ? prisma.billPayment.findMany() : [],
    settings.include_bills !== false ? prisma.creditNote.findMany() : [],
    settings.include_bills !== false ? prisma.creditNoteLineItem.findMany() : [],
    settings.include_bills !== false ? prisma.creditNoteRedemption.findMany() : [],
    settings.include_stock !== false ? prisma.transferRequest.findMany() : [],
    settings.include_stock !== false ? prisma.bulkTransferRequest.findMany() : [],
    settings.include_stock !== false ? prisma.bulkTransferRequestItem.findMany() : [],
    settings.include_stock !== false ? prisma.stockLedger.findMany() : [],
    prisma.user.findMany(),
  ]);

  Object.assign(collections, {
    categories: serializeRows(categories),
    vendors: serializeRows(vendors),
    warehouses: serializeRows(warehouses),
    shops: serializeRows(shops),
    products: serializeRows(products),
    product_variants: serializeRows(product_variants),
    product_variant_images: serializeRows(product_variant_images),
    shop_gst_registrations: serializeRows(shop_gst_registrations),
    shop_bank_accounts: serializeRows(shop_bank_accounts),
    shop_staff_codes: serializeRows(shop_staff_codes),
    customers: serializeRows(customers),
    product_stocks: serializeRows(product_stocks),
    shop_stocks: serializeRows(shop_stocks),
    shop_product_levels: serializeRows(shop_product_levels),
    purchase_entries: serializeRows(purchase_entries),
    purchase_items: serializeRows(purchase_items),
    warehouse_expenses: serializeRows(warehouse_expenses),
    shop_expenses: serializeRows(shop_expenses),
    vendor_payments: serializeRows(vendor_payments),
    vendor_payment_allocations: serializeRows(vendor_payment_allocations),
    inward_receipts: serializeRows(inward_receipts),
    inward_receipt_items: serializeRows(inward_receipt_items),
    debit_notes: serializeRows(debit_notes),
    debit_note_line_items: serializeRows(debit_note_line_items),
    bills: serializeRows(bills),
    bill_line_items: serializeRows(bill_line_items),
    bill_payments: serializeRows(bill_payments),
    credit_notes: serializeRows(credit_notes),
    credit_note_line_items: serializeRows(credit_note_line_items),
    credit_note_redemptions: serializeRows(credit_note_redemptions),
    transfer_requests: serializeRows(transfer_requests),
    bulk_transfer_requests: serializeRows(bulk_transfer_requests),
    bulk_transfer_request_items: serializeRows(bulk_transfer_request_items),
    stock_ledgers: serializeRows(stock_ledgers),
    users: serializeRows(stripUserSecrets(users)),
  });

  return collections;
};

const exportShopScope = async (shopId, settings) => {
  const collections = {};

  const shop = await prisma.shop.findUnique({ where: { shop_id: shopId } });
  if (!shop) return collections;

  collections.shops = serializeRows([shop]);

  if (settings.include_settings !== false) {
    const gst = await prisma.shopGstRegistration.findMany({ where: { shop_id: shopId } });
    collections.shop_gst_registrations = serializeRows(gst);
    const gstConfigIds = gst.map((g) => g.gst_config_id);
    const banks = gstConfigIds.length
      ? await prisma.shopBankAccount.findMany({
          where: { gst_config_id: { in: gstConfigIds } },
        })
      : [];
    collections.shop_bank_accounts = serializeRows(banks);
  }

  if (settings.include_staff_codes !== false) {
    collections.shop_staff_codes = serializeRows(
      await prisma.shopStaffCode.findMany({ where: { shop_id: shopId } })
    );
  }

  let bills = [];
  let billIds = [];
  if (settings.include_bills !== false) {
    bills = await prisma.bill.findMany({ where: { shop_id: shopId } });
    billIds = bills.map((b) => b.bill_id);
    collections.bills = serializeRows(bills);

    if (billIds.length) {
      collections.bill_line_items = serializeRows(
        await prisma.billLineItem.findMany({ where: { bill_id: { in: billIds } } })
      );
      collections.bill_payments = serializeRows(
        await prisma.billPayment.findMany({ where: { bill_id: { in: billIds } } })
      );
    }
  }

  if (settings.include_customers !== false) {
    const customerIds = unique(bills.map((b) => b.customer_id));
    if (customerIds.length) {
      collections.customers = serializeRows(
        await prisma.customer.findMany({ where: { customer_id: { in: customerIds } } })
      );
    }
  }

  if (settings.include_bills !== false) {
    const creditNotes = await prisma.creditNote.findMany({ where: { shop_id: shopId } });
    const creditNoteIds = creditNotes.map((c) => c.credit_note_id);
    collections.credit_notes = serializeRows(creditNotes);

    if (creditNoteIds.length) {
      collections.credit_note_line_items = serializeRows(
        await prisma.creditNoteLineItem.findMany({ where: { credit_note_id: { in: creditNoteIds } } })
      );
      collections.credit_note_redemptions = serializeRows(
        await prisma.creditNoteRedemption.findMany({ where: { credit_note_id: { in: creditNoteIds } } })
      );
    }
  }

  if (settings.include_stock !== false) {
    collections.shop_stocks = serializeRows(
      await prisma.shopStock.findMany({ where: { shop_id: shopId } })
    );
    collections.shop_product_levels = serializeRows(
      await prisma.shopProductLevel.findMany({ where: { shop_id: shopId } })
    );
    collections.transfer_requests = serializeRows(
      await prisma.transferRequest.findMany({
        where: { OR: [{ from_shop_id: shopId }, { to_shop_id: shopId }] },
      })
    );
    collections.bulk_transfer_requests = serializeRows(
      await prisma.bulkTransferRequest.findMany({
        where: { OR: [{ from_shop_id: shopId }, { to_shop_id: shopId }] },
      })
    );
    const bulkIds = (collections.bulk_transfer_requests || []).map((b) => b.bulk_request_id);
    if (bulkIds.length) {
      collections.bulk_transfer_request_items = serializeRows(
        await prisma.bulkTransferRequestItem.findMany({ where: { bulk_request_id: { in: bulkIds } } })
      );
    }
    collections.shop_expenses = serializeRows(
      await prisma.shopExpense.findMany({ where: { shop_id: shopId } })
    );
  }

  const variantIds = [];
  for (const row of collections.bill_line_items || []) variantIds.push(row.variant_id);
  for (const row of collections.shop_stocks || []) variantIds.push(row.variant_id);
  for (const row of collections.credit_note_line_items || []) variantIds.push(row.variant_id);
  for (const row of collections.bulk_transfer_request_items || []) variantIds.push(row.variant_id);

  if (settings.include_products !== false) {
    const master = await loadReferencedMasterData(variantIds);
    collections.categories = serializeRows(master.categories);
    collections.vendors = serializeRows(master.vendors);
    collections.products = serializeRows(master.products);
    collections.product_variants = serializeRows(master.product_variants);
    collections.product_variant_images = serializeRows(master.product_variant_images);
  }

  await attachReferencedUsers(collections);
  return collections;
};

const exportWarehouseScope = async (warehouseId, settings) => {
  const collections = {};

  const warehouse = await prisma.warehouse.findUnique({ where: { warehouse_id: warehouseId } });
  if (!warehouse) return collections;

  collections.warehouses = serializeRows([warehouse]);

  if (settings.include_stock !== false) {
    collections.product_stocks = serializeRows(
      await prisma.productStock.findMany({ where: { warehouse_id: warehouseId } })
    );
    collections.transfer_requests = serializeRows(
      await prisma.transferRequest.findMany({
        where: { OR: [{ from_warehouse_id: warehouseId }, { to_warehouse_id: warehouseId }] },
      })
    );
    collections.bulk_transfer_requests = serializeRows(
      await prisma.bulkTransferRequest.findMany({
        where: { OR: [{ from_warehouse_id: warehouseId }, { to_warehouse_id: warehouseId }] },
      })
    );
    const bulkIds = (await prisma.bulkTransferRequest.findMany({
      where: { OR: [{ from_warehouse_id: warehouseId }, { to_warehouse_id: warehouseId }] },
      select: { bulk_request_id: true },
    })).map((b) => b.bulk_request_id);

    if (bulkIds.length) {
      collections.bulk_transfer_request_items = serializeRows(
        await prisma.bulkTransferRequestItem.findMany({ where: { bulk_request_id: { in: bulkIds } } })
      );
    }
    collections.stock_ledgers = serializeRows(
      await prisma.stockLedger.findMany({
        where: {
          OR: [
            { from_warehouse_id: warehouseId },
            { to_warehouse_id: warehouseId },
          ],
        },
      })
    );
  }

  const purchaseEntries = await prisma.purchaseEntry.findMany({ where: { warehouse_id: warehouseId } });
  const purchaseIds = purchaseEntries.map((p) => p.purchase_id);
  collections.purchase_entries = serializeRows(purchaseEntries);

  if (purchaseIds.length) {
    collections.purchase_items = serializeRows(
      await prisma.purchaseItem.findMany({ where: { purchase_id: { in: purchaseIds } } })
    );
  }

  collections.inward_receipts = serializeRows(
    await prisma.inwardReceipt.findMany({ where: { warehouse_id: warehouseId } })
  );
  const inwardIds = (collections.inward_receipts || []).map((i) => i.inward_id);
  if (inwardIds.length) {
    collections.inward_receipt_items = serializeRows(
      await prisma.inwardReceiptItem.findMany({ where: { inward_id: { in: inwardIds } } })
    );
  }

  collections.warehouse_expenses = serializeRows(
    await prisma.warehouseExpense.findMany({ where: { warehouse_id: warehouseId } })
  );

  const vendorPayments = await prisma.vendorPayment.findMany({ where: { warehouse_id: warehouseId } });
  collections.vendor_payments = serializeRows(vendorPayments);
  const paymentIds = vendorPayments.map((p) => p.payment_id);
  if (paymentIds.length) {
    collections.vendor_payment_allocations = serializeRows(
      await prisma.vendorPaymentAllocation.findMany({ where: { payment_id: { in: paymentIds } } })
    );
  }

  const debitNotes = await prisma.debitNote.findMany({ where: { warehouse_id: warehouseId } });
  collections.debit_notes = serializeRows(debitNotes);
  const debitNoteIds = debitNotes.map((d) => d.debit_note_id);
  if (debitNoteIds.length) {
    collections.debit_note_line_items = serializeRows(
      await prisma.debitNoteLineItem.findMany({ where: { debit_note_id: { in: debitNoteIds } } })
    );
  }

  const variantIds = [];
  for (const row of collections.purchase_items || []) variantIds.push(row.variant_id);
  for (const row of collections.product_stocks || []) variantIds.push(row.variant_id);
  for (const row of collections.debit_note_line_items || []) variantIds.push(row.variant_id);
  for (const row of collections.bulk_transfer_request_items || []) variantIds.push(row.variant_id);

  const vendorIds = unique([
    ...purchaseEntries.map((p) => p.vendor_id),
    ...(collections.inward_receipts || []).map((i) => i.vendor_id),
    ...vendorPayments.map((p) => p.vendor_id),
  ]);

  if (settings.include_products !== false) {
    const master = await loadReferencedMasterData(variantIds);
    collections.categories = serializeRows(master.categories);
    collections.products = serializeRows(master.products);
    collections.product_variants = serializeRows(master.product_variants);
    collections.product_variant_images = serializeRows(master.product_variant_images);

    const refVendors = vendorIds.length
      ? await prisma.vendor.findMany({ where: { vendor_id: { in: vendorIds } } })
      : [];
    const mergedVendors = [...master.vendors];
    for (const v of refVendors) {
      if (!mergedVendors.find((x) => x.vendor_id === v.vendor_id)) mergedVendors.push(v);
    }
    collections.vendors = serializeRows(mergedVendors);
  } else if (vendorIds.length) {
    collections.vendors = serializeRows(
      await prisma.vendor.findMany({ where: { vendor_id: { in: vendorIds } } })
    );
  }

  await attachReferencedUsers(collections);
  return collections;
};

const exportBackupData = async (user, scope, settings) => {
  let collections = {};

  if (scope.type === SCOPE_TYPE.SYSTEM) {
    collections = await exportSystemScope(settings);
  } else if (scope.type === SCOPE_TYPE.SHOP) {
    collections = await exportShopScope(scope.shop_id, settings);
  } else if (scope.type === SCOPE_TYPE.WAREHOUSE) {
    collections = await exportWarehouseScope(scope.warehouse_id, settings);
  }

  const manifest = buildManifest(user, scope, collections);
  return { manifest, collections };
};

module.exports = {
  exportBackupData,
  buildManifest,
};
