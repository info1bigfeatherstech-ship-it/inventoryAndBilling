const ExcelJS = require('exceljs');
const {
  UNIT_OF_MEASURE_VALUES,
  UNIT_OF_MEASURE_DESCRIPTIONS,
} = require('../../constants/unitOfMeasure.constants');

/** Mirrors Prisma GSTType enum (schema.prisma). */
const GST_TYPE_VALUES = ['CGST_SGST', 'IGST', 'EXEMPT'];

const GST_PERCENT_VALUES = [0, 5, 12, 18, 28];

const TEMPLATE_APP_NAME = 'Vyaapar Inventory & Billing';

const UPLOAD_DATA_HEADERS = [
  'name',
  'title',
  'description',
  'brand_name',
  'product_code',
  'vendor_name',
  'category_name',
  'sub_category_name',
  'mrp',
  'special_price',
  'wholesale_price',
  'purchase_price',
  'expenses',
  'warranty',
  'attributes',
  'hsn_code',
  'gst_percent',
  'gst_type',
  'unit_of_measure',
  'weight',
  'length',
  'width',
  'height',
  'low_stock_threshold',
  'remarks',
];

/** Red header cells on Upload Data — must match Required fields in Instructions. */
const MANDATORY_HEADER_FIELDS = [
  'name',
  'product_code',
  'vendor_name',
  'category_name',
  'mrp',
  'special_price',
  'wholesale_price',
  'purchase_price',
  'expenses',
  'unit_of_measure',
  'weight',
  'length',
  'width',
  'height',
  'low_stock_threshold',
];

const OPTIONAL_HEADER_FIELDS = UPLOAD_DATA_HEADERS.filter(
  (header) => !MANDATORY_HEADER_FIELDS.includes(header),
);

const formatFieldList = (fields) => fields.join(', ');

const buildInstructionsRows = () => [
  ['Bulk Product Upload — Instructions', null],
  ['Use the "Upload Data" sheet to fill in product details. Read this sheet carefully before starting.', null],
  [null, null],
  ['GENERAL RULES', null],
  ['One row = one variant', 'Each row maps to a ProductVariant. Single variant: use base code (e.g. 3321) or 3321-1 — both create the primary variant. Multiple variants: same name with 3212, 3212-2, 3212-3 or 3212-1, 3212-2, 3212-3.'],
  ['product_code format', 'Single variant: base code alone (e.g. 2313) auto-creates primary variant 2313-1. You may also write 2313-1 explicitly. Multi-variant: first row 2313 or 2313-1, then 2313-2, 2313-3 on separate rows with the same name. Duplicate base codes in the same CSV are rejected. Product code is stored exactly as entered (0398 stays 0398, 398 stays 398). Set product_code column to Text in Excel before filling.'],
  ['Required fields', formatFieldList(MANDATORY_HEADER_FIELDS)],
  ['Optional fields', formatFieldList(OPTIONAL_HEADER_FIELDS)],
  ['No empty required fields', 'Red header columns on Upload Data are required. Leave optional fields blank if not applicable. Do NOT delete or reorder columns.'],
  [null, null],
  ['UPLOAD DATA — COLUMN ORDER (left to right, do not change)', null],
  ['All columns', UPLOAD_DATA_HEADERS.join(' → ')],
  [null, null],
  ['DROPDOWN / ENUM FIELDS', null],
  ['gst_percent', 'Optional. Column after hsn_code. Common values: 0, 5, 12, 18, 28 (enter as number, not %). Select from dropdown.'],
  ['gst_type', 'Optional. Column after gst_percent. CGST_SGST = intra-state | IGST = inter-state | EXEMPT = GST-exempt goods. Select from dropdown.'],
  ['unit_of_measure', `Required. Column after gst_type. ${UNIT_OF_MEASURE_VALUES.join(', ')} — select from dropdown.`],
  ['category_name / vendor_name', 'Required. Select from dropdown (must match names already in your system).'],
  [null, null],
  ['PRICING FIELDS (all required)', null],
  ['mrp', 'Required. Maximum Retail Price. Must be ≥ special_price.'],
  ['special_price', 'Required. Selling price shown to customer. Must be > 0.'],
  ['wholesale_price', 'Required. Franchise / B2B price. Separate from purchase_price. Must be between purchase_price and special_price.'],
  ['purchase_price', 'Required. Cost price from vendor (excluding GST).'],
  ['expenses', 'Required. Landed cost additions (freight, handling). Use 0 if none.'],
  ['warranty', 'Optional warranty text, e.g. "1 Year", "6 Months", "No Warranty".'],
  [null, null],
  ['VARIANT ATTRIBUTES', null],
  ['attributes', 'Optional. Column after warranty. Pipe-separated key:value pairs per variant row. Example: Color:White|Size:M — shown on invoices to identify the variant.'],
  [null, null],
  ['DIMENSION & WEIGHT FIELDS (for shipping)', null],
  ['weight', 'Required. In grams (g). Example: 350 for 350g.'],
  ['length / width / height', 'Required. In centimeters (cm). Used for volumetric weight calculation.'],
  ['low_stock_threshold', 'Required. Minimum stock level before low-stock alert (e.g. 10).'],
  [null, null],
  ['CATEGORY & VENDOR', null],
  ['category_name', 'Required. Must match an existing category name in the system (select from dropdown).'],
  ['sub_category_name', 'Optional. If provided, must exist under the given category.'],
  ['vendor_name', 'Required. Must match an existing vendor company_name in the system (select from dropdown).'],
  [null, null],
  ['EXAMPLE ROW (key fields only)', null],
  ['name', 'Wireless Earbuds Pro'],
  ['title', 'Wireless Earbuds - White'],
  ['product_code', '9904-1'],
  ['vendor_name', 'HiTech'],
  ['category_name', 'Electronics'],
  ['warranty', '1 Year'],
  ['attributes', 'Color:White'],
  ['hsn_code', '8518'],
  ['gst_percent', '18'],
  ['gst_type', 'CGST_SGST'],
  ['unit_of_measure', 'Pcs'],
  ['weight', '350'],
  ['length / width / height', '6 / 4 / 3'],
  ['low_stock_threshold', '10'],
];

/** Map Upload Data header name → Excel column letter (stays correct when columns are added). */
const headerToColLetter = (header) => {
  const idx = UPLOAD_DATA_HEADERS.indexOf(header);
  if (idx < 0) return null;
  let n = idx + 1;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
};

const colRange = (header, lastRow = 5000) => {
  const col = headerToColLetter(header);
  if (!col) return null;
  return `${col}2:${col}${lastRow}`;
};

const UPLOAD_DATA_SAMPLE_ROWS = [
  ['Ceramic Coffee Mug', 'Ceramic Coffee Mug - Matte Black', '350ml ceramic mug with handle', 'HomeStyle', '9901-1', 'HiTech', 'Electronics', null, 599, 449, 320, 80, 20, '1 Year', 'Color:Black|Size:350ml', '6912', 12, 'CGST_SGST', 'Pcs', 350, 12, 9, 10, 15, 'Test upload - expect purchase_code 2086'],
  ['Running Sports Shoes', 'Running Shoes - Size 8 UK', 'Lightweight mesh running shoes', 'SportMax', '9902-1', 'HiTech', 'Electronics', null, 3499, 2799, 2200, 350, 45, '6 Months', 'Color:Blue|Size:8 UK', '6404', 18, 'CGST_SGST', 'Pcs', 450, 32, 22, 12, 8, 'Test upload variant 1 - expect purchase_code 2381'],
  ['Running Sports Shoes', 'Running Shoes - Size 9 UK', 'Lightweight mesh running shoes', 'SportMax', '9902-2', 'HiTech', 'Electronics', null, 3499, 2799, 2200, 350, 45, '6 Months', 'Color:Blue|Size:9 UK', '6404', 18, 'CGST_SGST', 'Pcs', 450, 32, 22, 12, 8, 'Test upload variant 2 - same pricing - expect purchase_code 2381'],
  ['USB-C Cable 3-Pack', 'USB-C to USB-A Cable 1m (3 pcs)', 'Fast charge braided cables', 'TechLine', '9903-1', 'HiTech', 'Electronics', null, 899, 699, 520, 120, 25, '3 Months', 'Length:1m|Pack:3', '8544', 12, 'CGST_SGST', 'Pcs', 120, 18, 12, 3, 20, 'Test upload - expect purchase_code 2131'],
  ['Wireless Earbuds Pro', 'Wireless Earbuds - White', 'ANC TWS earbuds with case', 'AudioPro', '9904-1', 'HiTech', 'Electronics', null, 4999, 3999, 3100, 900, 100, '1 Year', 'Color:White', '8518', 18, 'CGST_SGST', 'Pcs', 55, 6, 4, 3, 10, 'Test upload - expect purchase_code 2986'],
  ['Wireless Earbuds Pro', 'Wireless Earbuds - Black', 'ANC TWS earbuds with case', 'AudioPro', '9904-2', 'HiTech', 'Electronics', null, 4999, 3999, 3150, 950, 80, '1 Year', 'Color:Black', '8518', 18, 'CGST_SGST', 'Pcs', 55, 6, 4, 3, 10, 'Test upload variant 2 - different pricing - expect purchase_code 3016'],
];

const buildUnitOfMeasureEnumReferenceRows = () => {
  const header = ['unit_of_measure  (dropdown in Upload Data)', 'unit_of_measure  (dropdown in Upload Data)', 'unit_of_measure  (dropdown in Upload Data)'];
  const rows = UNIT_OF_MEASURE_VALUES.map((value) => [
    'unit_of_measure',
    value,
    UNIT_OF_MEASURE_DESCRIPTIONS[value] || value,
  ]);
  return [header, ...rows];
};

const ENUM_REFERENCE_ROWS = [
  ['Enum / Dropdown Reference', 'Enum / Dropdown Reference', 'Enum / Dropdown Reference'],
  [null, null, null],
  ['gst_type  (dropdown in Upload Data)', 'gst_type  (dropdown in Upload Data)', 'gst_type  (dropdown in Upload Data)'],
  ['gst_type', 'CGST_SGST', 'Intra-state sale — splits into CGST + SGST on invoice'],
  ['gst_type', 'IGST', 'Inter-state sale — single IGST line on invoice'],
  ['gst_type', 'EXEMPT', 'GST-exempt goods (e.g. fresh produce, basic food items)'],
  [null, null, null],
  ['gst_percent  (dropdown in Upload Data — enter as plain number)', 'gst_percent  (dropdown in Upload Data — enter as plain number)', 'gst_percent  (dropdown in Upload Data — enter as plain number)'],
  ['gst_percent', '0', 'Nil rated goods'],
  ['gst_percent', '5', 'Essential goods, packaged food, etc.'],
  ['gst_percent', '12', 'Processed food, textiles, phones, etc.'],
  ['gst_percent', '18', 'Electronics, most manufactured goods'],
  ['gst_percent', '28', 'Luxury goods, automobiles, tobacco'],
  [null, null, null],
  ...buildUnitOfMeasureEnumReferenceRows(),
  [null, null, null],
  ['GSTType Enum  (from schema — same values as gst_type above)', 'GSTType Enum  (from schema — same values as gst_type above)', 'GSTType Enum  (from schema — same values as gst_type above)'],
  ['Schema enum', 'CGST_SGST', null],
  ['Schema enum', 'IGST', null],
  ['Schema enum', 'EXEMPT', null],
  [null, null, null],
  ['Notes', 'Notes', 'Notes'],
  ['product_code', 'Must be unique per warehouse', 'Single variant: 2313 or 2313-1 (same result). Multi-variant: 2313, 2313-2, 2313-3 or 2313-1, 2313-2, 2313-3. Do not repeat the same code in one CSV.'],
  ['hsn_code', 'Harmonised System of Nomenclature', '4–8 digit code. Refer to GST HSN schedule for your product category.'],
  ['expenses', 'Landed cost additions', 'Freight, handling charges etc. Default 0 if blank.'],
];
const addRows = (worksheet, rows) => {
  for (const row of rows) {
    worksheet.addRow(row);
  }
};

const populateListColumn = (worksheet, columnIndex, values, startRow = 2) => {
  values.forEach((value, index) => {
    worksheet.getCell(startRow + index, columnIndex).value = value;
  });
};

const applyListValidation = (worksheet, cellRange, listFormula) => {
  worksheet.dataValidations.add(cellRange, {
    type: 'list',
    allowBlank: true,
    formulae: [listFormula],
    showErrorMessage: true,
    errorTitle: 'Invalid value',
    error: 'Please select a value from the dropdown list.',
  });
};

const buildInstructionsSheet = (workbook) => {
  const ws = workbook.addWorksheet('Instructions');
  addRows(ws, buildInstructionsRows());
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 90;
  return ws;
};

// const buildUploadDataSheet = (workbook) => {
//   const ws = workbook.addWorksheet('Upload Data');
//   ws.addRow(UPLOAD_DATA_HEADERS);
//   ws.getRow(1).font = { bold: true };
//   addRows(ws, UPLOAD_DATA_SAMPLE_ROWS);
//   UPLOAD_DATA_HEADERS.forEach((_, index) => {
//     ws.getColumn(index + 1).width = Math.max(UPLOAD_DATA_HEADERS[index].length + 2, 14);
//   });
//   return ws;
// };


const buildUploadDataSheet = (workbook) => {
  const ws = workbook.addWorksheet('Upload Data');
  ws.addRow(UPLOAD_DATA_HEADERS);
  ws.getRow(1).font = { bold: true };

  UPLOAD_DATA_HEADERS.forEach((header, index) => {
    const cell = ws.getRow(1).getCell(index + 1);
    if (MANDATORY_HEADER_FIELDS.includes(header)) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }
  });

  addRows(ws, UPLOAD_DATA_SAMPLE_ROWS);
  UPLOAD_DATA_HEADERS.forEach((header, index) => {
    const col = ws.getColumn(index + 1);
    col.width = Math.max(UPLOAD_DATA_HEADERS[index].length + 2, 14);
    if (header === 'product_code') {
      col.numFmt = '@';
    }
  });
  return ws;
};

const buildEnumReferenceSheet = (workbook) => {
  const ws = workbook.addWorksheet('Enum Reference');
  addRows(ws, ENUM_REFERENCE_ROWS);
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 70;
  return ws;
};

const buildListsSheet = (workbook, { categoryNames, vendorNames }) => {
  const ws = workbook.addWorksheet('Lists');
  ws.getCell(1, 1).value = 'category_name';
  ws.getCell(1, 2).value = 'vendor_name';
  ws.getCell(1, 3).value = 'gst_type';
  ws.getCell(1, 4).value = 'gst_percent';
  ws.getCell(1, 5).value = 'unit_of_measure';
  ws.getRow(1).font = { bold: true };

  populateListColumn(ws, 1, categoryNames);
  populateListColumn(ws, 2, vendorNames);
  populateListColumn(ws, 3, GST_TYPE_VALUES);
  populateListColumn(ws, 4, GST_PERCENT_VALUES);
  populateListColumn(ws, 5, UNIT_OF_MEASURE_VALUES);

  ws.state = 'hidden';
  return ws;
};

const applyUploadDataValidations = (uploadSheet, { categoryNames, vendorNames }) => {
  if (categoryNames.length > 0) {
    const categoryEndRow = categoryNames.length + 1;
    applyListValidation(
      uploadSheet,
      colRange('category_name'),
      `'Lists'!$A$2:$A$${categoryEndRow}`
    );
  }

  if (vendorNames.length > 0) {
    const vendorEndRow = vendorNames.length + 1;
    applyListValidation(
      uploadSheet,
      colRange('vendor_name'),
      `'Lists'!$B$2:$B$${vendorEndRow}`
    );
  }

  applyListValidation(
    uploadSheet,
    colRange('gst_percent'),
    `'Lists'!$D$2:$D$${GST_PERCENT_VALUES.length + 1}`
  );
  applyListValidation(
    uploadSheet,
    colRange('gst_type'),
    `'Lists'!$C$2:$C$${GST_TYPE_VALUES.length + 1}`
  );
  applyListValidation(
    uploadSheet,
    colRange('unit_of_measure'),
    `'Lists'!$E$2:$E$${UNIT_OF_MEASURE_VALUES.length + 1}`
  );
};

/**
 * Build a bulk product upload Excel template with live category/vendor dropdowns.
 * @param {{ categoryNames: string[], vendorNames: string[] }} params
 * @returns {Promise<Buffer>}
 */

const generateBulkProductTemplate = async ({ categoryNames = [], vendorNames = [] } = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = TEMPLATE_APP_NAME;
  workbook.created = new Date();

  buildInstructionsSheet(workbook);
  const uploadSheet = buildUploadDataSheet(workbook);
  buildEnumReferenceSheet(workbook);
  buildListsSheet(workbook, { categoryNames, vendorNames });
  applyUploadDataValidations(uploadSheet, { categoryNames, vendorNames });

  // Open the file directly on "Upload Data" tab (index 1) instead of "Instructions" (index 0),
  // so users land where they actually need to fill data.
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 10000,
      height: 20000,
      firstSheet: 0,
      activeTab: 1,
      visibility: 'visible',
    },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
// const generateBulkProductTemplate = async ({ categoryNames = [], vendorNames = [] } = {}) => {
//   const workbook = new ExcelJS.Workbook();
//   workbook.creator = TEMPLATE_APP_NAME;
//   workbook.created = new Date();

//   buildInstructionsSheet(workbook);
//   const uploadSheet = buildUploadDataSheet(workbook);
//   buildEnumReferenceSheet(workbook);
//   buildListsSheet(workbook, { categoryNames, vendorNames });
//   applyUploadDataValidations(uploadSheet, { categoryNames, vendorNames });

//   const buffer = await workbook.xlsx.writeBuffer();
//   return Buffer.from(buffer);
// };

module.exports = {
  generateBulkProductTemplate,
};
