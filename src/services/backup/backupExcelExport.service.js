const ExcelJS = require('exceljs');
const { BACKUP_APP_NAME } = require('./backup.constants');

const SKIP_EXCEL_COLLECTIONS = new Set([
  'product_variant_images',
  'products',
  'product_variants',
]);

const toMap = (rows, keyField) => {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.[keyField]) map.set(row[keyField], row);
  }
  return map;
};

const buildLookups = (collections) => {
  const categories = toMap(collections.categories, 'category_id');
  const vendors = toMap(collections.vendors, 'vendor_id');
  const warehouses = toMap(collections.warehouses, 'warehouse_id');
  const shops = toMap(collections.shops, 'shop_id');
  const users = toMap(collections.users, 'user_id');
  const customers = toMap(collections.customers, 'customer_id');
  const products = toMap(collections.products, 'product_id');
  const variants = toMap(collections.product_variants, 'variant_id');
  const bills = toMap(collections.bills, 'bill_id');
  const purchases = toMap(collections.purchase_entries, 'purchase_id');
  const creditNotes = toMap(collections.credit_notes, 'credit_note_id');
  const debitNotes = toMap(collections.debit_notes, 'debit_note_id');
  const staffCodes = toMap(collections.shop_staff_codes, 'staff_code_id');
  const gstConfigs = toMap(collections.shop_gst_registrations, 'gst_config_id');
  const bankAccounts = toMap(collections.shop_bank_accounts, 'bank_account_id');

  const imagesByVariant = new Map();
  for (const img of collections.product_variant_images || []) {
    if (!img?.variant_id || !img?.url) continue;
    if (!imagesByVariant.has(img.variant_id)) imagesByVariant.set(img.variant_id, []);
    imagesByVariant.get(img.variant_id).push(img.url);
  }

  return {
    categories,
    vendors,
    warehouses,
    shops,
    users,
    customers,
    products,
    variants,
    bills,
    purchases,
    creditNotes,
    debitNotes,
    staffCodes,
    gstConfigs,
    bankAccounts,
    imagesByVariant,
  };
};

const nameOf = (map, id, field, fallback = '') => {
  if (!id) return fallback;
  const row = map.get(id);
  return row?.[field] ?? fallback;
};

const ID_FIELD_RESOLVERS = {
  warehouse_id: (l, id) => nameOf(l.warehouses, id, 'warehouse_name'),
  from_warehouse_id: (l, id) => nameOf(l.warehouses, id, 'warehouse_name'),
  to_warehouse_id: (l, id) => nameOf(l.warehouses, id, 'warehouse_name'),
  shop_id: (l, id) => nameOf(l.shops, id, 'shop_name'),
  from_shop_id: (l, id) => nameOf(l.shops, id, 'shop_name'),
  to_shop_id: (l, id) => nameOf(l.shops, id, 'shop_name'),
  redeemed_at_shop_id: (l, id) => nameOf(l.shops, id, 'shop_name'),
  vendor_id: (l, id) => nameOf(l.vendors, id, 'company_name'),
  primary_vendor_id: (l, id) => nameOf(l.vendors, id, 'company_name'),
  customer_id: (l, id) => nameOf(l.customers, id, 'name'),
  category_id: (l, id) => nameOf(l.categories, id, 'name'),
  sub_category_id: (l, id) => nameOf(l.categories, id, 'name'),
  parent_id: (l, id) => nameOf(l.categories, id, 'name'),
  product_id: (l, id) => nameOf(l.products, id, 'name'),
  variant_id: (l, id) => {
    const v = l.variants.get(id);
    if (!v) return '';
    return `${v.product_code || ''} / ${v.sku || ''}`.trim();
  },
  owner_user_id: (l, id) => nameOf(l.users, id, 'name'),
  user_id: (l, id) => nameOf(l.users, id, 'name'),
  created_by_user_id: (l, id) => nameOf(l.users, id, 'name'),
  paid_by_user_id: (l, id) => nameOf(l.users, id, 'name'),
  cancelled_by_user_id: (l, id) => nameOf(l.users, id, 'name'),
  received_by_user_id: (l, id) => nameOf(l.users, id, 'name'),
  refunded_by_user_id: (l, id) => nameOf(l.users, id, 'name'),
  requested_by: (l, id) => nameOf(l.users, id, 'name'),
  approved_by: (l, id) => nameOf(l.users, id, 'name'),
  dispatched_by: (l, id) => nameOf(l.users, id, 'name'),
  received_by: (l, id) => nameOf(l.users, id, 'name'),
  cancelled_by: (l, id) => nameOf(l.users, id, 'name'),
  recorded_by_user_id: (l, id) => nameOf(l.users, id, 'name'),
  bill_id: (l, id) => nameOf(l.bills, id, 'bill_number'),
  original_bill_id: (l, id) => nameOf(l.bills, id, 'bill_number'),
  redeemed_against_bill_id: (l, id) => nameOf(l.bills, id, 'bill_number'),
  against_bill_id: (l, id) => nameOf(l.bills, id, 'bill_number'),
  purchase_id: (l, id) => nameOf(l.purchases, id, 'purchase_number'),
  original_purchase_id: (l, id) => nameOf(l.purchases, id, 'purchase_number'),
  credit_note_id: (l, id) => nameOf(l.creditNotes, id, 'credit_note_number'),
  debit_note_id: (l, id) => nameOf(l.debitNotes, id, 'debit_note_number'),
  staff_code_id: (l, id) => nameOf(l.staffCodes, id, 'code'),
  gst_config_id: (l, id) => nameOf(l.gstConfigs, id, 'gst_number'),
  bank_account_id: (l, id) => nameOf(l.bankAccounts, id, 'account_holder_name'),
  mapped_product_id: (l, id) => nameOf(l.products, id, 'name'),
  mapped_variant_id: (l, id) => {
    const v = l.variants.get(id);
    if (!v) return '';
    return `${v.product_code || ''} / ${v.sku || ''}`.trim();
  },
};

const HIDDEN_EXCEL_FIELDS = new Set([
  'password_hash',
  'attributes',
]);

const humanizeKey = (key) =>
  key
    .replace(/_id$/, '_name')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const rowToExcelObject = (row, lookups) => {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (HIDDEN_EXCEL_FIELDS.has(key)) continue;

    if (ID_FIELD_RESOLVERS[key]) {
      const labelKey = humanizeKey(key);
      out[labelKey] = ID_FIELD_RESOLVERS[key](lookups, value) || value || '';
      continue;
    }

    if (key.endsWith('_id')) {
      out[humanizeKey(key)] = value ?? '';
      continue;
    }

    out[humanizeKey(key)] = value ?? '';
  }
  return out;
};

const buildProductsAndVariantsRows = (collections, lookups) => {
  const products = collections.products || [];
  const variants = collections.product_variants || [];
  const variantsByProduct = new Map();

  for (const variant of variants) {
    if (!variantsByProduct.has(variant.product_id)) {
      variantsByProduct.set(variant.product_id, []);
    }
    variantsByProduct.get(variant.product_id).push(variant);
  }

  const rows = [];

  for (const product of products) {
    const productVariants = variantsByProduct.get(product.product_id) || [];
    const warehouseName = nameOf(lookups.warehouses, product.warehouse_id, 'warehouse_name');
    const vendorName = nameOf(lookups.vendors, product.primary_vendor_id, 'company_name');
    const categoryName = nameOf(lookups.categories, product.category_id, 'name');
    const subCategoryName = nameOf(lookups.categories, product.sub_category_id, 'name');

    const baseProduct = {
      'Row Type': 'PRODUCT',
      'Product Code': product.product_code || '',
      'Product Name': product.name || '',
      Warehouse: warehouseName,
      Vendor: vendorName,
      Category: categoryName,
      'Sub Category': subCategoryName,
      HSN: product.hsn_code || '',
      'GST Percent': product.gst_percent ?? '',
      'GST Type': product.gst_type || '',
      'Unit Of Measure': product.unit_of_measure || '',
      Brand: product.brand_name || '',
      'Product MRP': product.mrp ?? '',
      'Product Special Price': product.special_price ?? '',
      'Product Purchase Price': product.purchase_price ?? '',
      'Product Active': product.is_active ?? '',
      'Variant SKU': '',
      'Variant Code': '',
      'System Barcode': '',
      'Vendor Barcode': '',
      'Variant MRP': '',
      'Variant Special Price': '',
      'Variant Purchase Price': '',
      'Variant Active': '',
      'Image URLs': '',
    };

    if (!productVariants.length) {
      rows.push(baseProduct);
      continue;
    }

    for (const variant of productVariants) {
      const imageUrls = (lookups.imagesByVariant.get(variant.variant_id) || []).join('\n');
      rows.push({
        ...baseProduct,
        'Row Type': 'VARIANT',
        'Variant SKU': variant.sku || '',
        'Variant Code': variant.product_code || '',
        'System Barcode': variant.system_barcode || '',
        'Vendor Barcode': variant.vendor_barcode || '',
        'Variant MRP': variant.mrp ?? '',
        'Variant Special Price': variant.special_price ?? '',
        'Variant Purchase Price': variant.purchase_price ?? '',
        'Variant Active': variant.is_active ?? '',
        'Image URLs': imageUrls,
      });
    }
  }

  return rows;
};

const enrichShopsRows = (rows, lookups) =>
  rows.map((shop) => ({
    ...rowToExcelObject(shop, lookups),
    Owner: nameOf(lookups.users, shop.owner_user_id, 'name'),
  }));

const enrichUsersRows = (rows, lookups) =>
  rows.map((user) => ({
    Name: user.name || '',
    Phone: user.phone || '',
    Role: user.role || '',
    Warehouse: nameOf(lookups.warehouses, user.warehouse_id, 'warehouse_name'),
    Shop: nameOf(lookups.shops, user.shop_id, 'shop_name'),
    Active: user.is_active ?? '',
    Remarks: user.remarks || '',
  }));

const COLLECTION_SHEET_NAMES = {
  categories: 'Categories',
  vendors: 'Vendors',
  warehouses: 'Warehouses',
  shops: 'Shops',
  customers: 'Customers',
  users: 'Users',
  shop_gst_registrations: 'Shop_GST',
  shop_bank_accounts: 'Shop_Bank_Accounts',
  shop_staff_codes: 'Shop_Staff_Codes',
  bills: 'Bills',
  bill_line_items: 'Bill_Line_Items',
  bill_payments: 'Bill_Payments',
  credit_notes: 'Credit_Notes',
  credit_note_line_items: 'Credit_Note_Items',
  credit_note_redemptions: 'Credit_Note_Redemptions',
  shop_stocks: 'Shop_Stock',
  shop_product_levels: 'Shop_Product_Levels',
  shop_expenses: 'Shop_Expenses',
  purchase_entries: 'Purchases',
  purchase_items: 'Purchase_Items',
  product_stocks: 'Warehouse_Stock',
  warehouse_expenses: 'Warehouse_Expenses',
  vendor_payments: 'Vendor_Payments',
  vendor_payment_allocations: 'Vendor_Payment_Allocations',
  inward_receipts: 'Inward_Receipts',
  inward_receipt_items: 'Inward_Receipt_Items',
  debit_notes: 'Debit_Notes',
  debit_note_line_items: 'Debit_Note_Items',
  transfer_requests: 'Transfer_Requests',
  bulk_transfer_requests: 'Bulk_Transfer_Requests',
  bulk_transfer_request_items: 'Bulk_Transfer_Items',
  stock_ledgers: 'Stock_Ledger',
};

const addSheetFromRows = (workbook, sheetName, rows) => {
  const ws = workbook.addWorksheet(sheetName.substring(0, 31));
  if (!rows.length) {
    ws.addRow(['No data in this backup scope']);
    return;
  }

  const headers = Object.keys(rows[0]);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    const values = headers.map((h) => row[h] ?? '');
    const excelRow = ws.addRow(values);

    if (headers.includes('Image URLs')) {
      const idx = headers.indexOf('Image URLs') + 1;
      const cell = excelRow.getCell(idx);
      const urls = String(cell.value || '')
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);
      if (urls.length === 1) {
        cell.value = { text: urls[0], hyperlink: urls[0] };
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      } else if (urls.length > 1) {
        cell.value = urls.join('\n');
      }
    }
  }

  headers.forEach((header, i) => {
    ws.getColumn(i + 1).width = Math.min(Math.max(String(header).length + 2, 12), 40);
  });
};

const buildWorkbookBuffer = async (sheetName, rows) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BACKUP_APP_NAME;
  workbook.created = new Date();
  addSheetFromRows(workbook, sheetName, rows);
  return workbook.xlsx.writeBuffer();
};

const buildInfoWorkbookBuffer = async (manifest) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Backup_Info');
  const infoRows = [
    ['Field', 'Value'],
    ['App', manifest.app],
    ['Format Version', manifest.format_version],
    ['Created At', manifest.created_at],
    ['Created By Role', manifest.created_by_role],
    ['Scope Type', manifest.scope?.type || ''],
    ['Scope Label', manifest.scope?.label || ''],
    ['Export Format', manifest.export_format || 'excel+json'],
    ['Sheets Included', (manifest.excel_files || []).join(', ')],
  ];
  for (const row of infoRows) ws.addRow(row);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 50;
  return workbook.xlsx.writeBuffer();
};

const buildExcelExports = async (collections, manifest) => {
  const lookups = buildLookups(collections);
  const excelFiles = {};
  const excelFileNames = [];

  const infoBuffer = await buildInfoWorkbookBuffer(manifest);
  excelFiles['Backup_Info.xlsx'] = infoBuffer;
  excelFileNames.push('Backup_Info.xlsx');

  const productRows = buildProductsAndVariantsRows(collections, lookups);
  if (productRows.length) {
    excelFiles['Products_and_Variants.xlsx'] = await buildWorkbookBuffer(
      'Products_and_Variants',
      productRows
    );
    excelFileNames.push('Products_and_Variants.xlsx');
  }

  for (const [collectionName, sheetName] of Object.entries(COLLECTION_SHEET_NAMES)) {
    if (SKIP_EXCEL_COLLECTIONS.has(collectionName)) continue;
    const rawRows = collections[collectionName];
    if (!Array.isArray(rawRows) || !rawRows.length) continue;

    let rows;
    if (collectionName === 'shops') {
      rows = enrichShopsRows(rawRows, lookups);
    } else if (collectionName === 'users') {
      rows = enrichUsersRows(rawRows, lookups);
    } else {
      rows = rawRows.map((row) => rowToExcelObject(row, lookups));
    }

    const fileName = `${sheetName}.xlsx`;
    excelFiles[fileName] = await buildWorkbookBuffer(sheetName, rows);
    excelFileNames.push(fileName);
  }

  return { excelFiles, excelFileNames };
};

module.exports = {
  buildExcelExports,
  buildLookups,
  buildProductsAndVariantsRows,
};
