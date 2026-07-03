const ExcelJS = require('exceljs');
const {
  UNIT_OF_MEASURE_VALUES,
  UNIT_OF_MEASURE_DESCRIPTIONS,
} = require('../../constants/unitOfMeasure.constants');

/** Mirrors Prisma GSTType enum (schema.prisma). */
const GST_TYPE_VALUES = ['CGST_SGST', 'IGST', 'EXEMPT'];

const GST_PERCENT_VALUES = [0, 5, 12, 18, 28];

const TEMPLATE_APP_NAME = 'Vyaapar Inventory & Billing';

const INSTRUCTIONS_ROWS = [
  ['Bulk Product Upload — Instructions', null],
  ['Use the "Upload Data" sheet to fill in product details. Read this sheet carefully before starting.', null],
  [null, null],
  ['GENERAL RULES', null],
  ['One row = one variant', 'Each row maps to a ProductVariant. If a product has 2 sizes, add 2 rows with the same name but different product_code (e.g. 9902-1, 9902-2).'],
  ['product_code format', 'Must be unique per warehouse. Format: NNNN-V where NNNN is product number and V is variant number (e.g. 9901-1).'],
  ['Required fields', 'name, product_code, category_name, mrp, special_price, wholesale_price, purchase_price, expenses'],
  ['Optional fields', 'title, description, brand_name, vendor_name, sub_category_name, warranty, weight, length, width, height, low_stock_threshold, remarks, hsn_code, gst_percent, gst_type, unit_of_measure'],
  ['No empty required fields', 'Leave optional fields blank if not applicable. Do NOT delete columns.'],
  [null, null],
  ['DROPDOWN / ENUM FIELDS', null],
  ['gst_type', 'CGST_SGST  →  Intra-state sales\nIGST  →  Inter-state sales\nEXEMPT  →  GST-exempt goods'],
  ['gst_percent', 'Common values: 0, 5, 12, 18, 28  (enter as number, not %)'],
  ['unit_of_measure', `${UNIT_OF_MEASURE_VALUES.join(', ')} (select from dropdown)`],
  [null, null],
  ['PRICING FIELDS', null],
  ['mrp', 'Maximum Retail Price. Must be ≥ special_price.'],
  ['special_price', 'Selling price shown to customer. Must be > 0.'],
  ['wholesale_price', 'Franchise / B2B price. Separate from purchase_price. Must be between purchase_price and special_price.'],
  ['purchase_price', 'Cost price from vendor (excluding GST).'],
  ['expenses', 'Landed cost additions (freight, handling).'],
  ['warranty', 'Optional warranty text, e.g. "1 Year", "6 Months", "No Warranty".'],
  [null, null],
  ['DIMENSION & WEIGHT FIELDS (for shipping)', null],
  ['weight', 'In grams (g). Example: 350 for 350g.'],
  ['length / width / height', 'In centimeters (cm). Used for volumetric weight calculation.'],
  [null, null],
  ['CATEGORY & VENDOR', null],
  ['category_name', 'Must match an existing category name in the system (select from dropdown).'],
  ['sub_category_name', 'Optional. If provided, must exist under the given category.'],
  ['vendor_name', 'Must match an existing vendor company_name in the system (select from dropdown).'],
  [null, null],
  ['EXAMPLE ROW', null],
  ['name', 'Wireless Earbuds Pro'],
  ['title', 'Wireless Earbuds - White'],
  ['product_code', '9904-1'],
  ['gst_type', 'CGST_SGST'],
  ['gst_percent', '18'],
  ['unit_of_measure', 'Pcs'],
];
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

const UPLOAD_DATA_SAMPLE_ROWS = [
  ['Ceramic Coffee Mug', 'Ceramic Coffee Mug - Matte Black', '350ml ceramic mug with handle', 'HomeStyle', '9901-1', 'HiTech', 'Electronics', null, 599, 449, 320, 80, 20, '1 Year', '6912', 12, 'CGST_SGST', 'Pcs', 350, 12, 9, 10, 15, 'Test upload - expect purchase_code 2086'],
  ['Running Sports Shoes', 'Running Shoes - Size 8 UK', 'Lightweight mesh running shoes', 'SportMax', '9902-1', 'HiTech', 'Electronics', null, 3499, 2799, 2200, 350, 45, '6 Months', '6404', 18, 'CGST_SGST', 'Pcs', 450, 32, 22, 12, 8, 'Test upload variant 1 - expect purchase_code 2381'],
  ['Running Sports Shoes', 'Running Shoes - Size 9 UK', 'Lightweight mesh running shoes', 'SportMax', '9902-2', 'HiTech', 'Electronics', null, 3499, 2799, 2200, 350, 45, '6 Months', '6404', 18, 'CGST_SGST', 'Pcs', 450, 32, 22, 12, 8, 'Test upload variant 2 - same pricing - expect purchase_code 2381'],
  ['USB-C Cable 3-Pack', 'USB-C to USB-A Cable 1m (3 pcs)', 'Fast charge braided cables', 'TechLine', '9903-1', 'HiTech', 'Electronics', null, 899, 699, 520, 120, 25, '3 Months', '8544', 12, 'CGST_SGST', 'Pcs', 120, 18, 12, 3, 20, 'Test upload - expect purchase_code 2131'],
  ['Wireless Earbuds Pro', 'Wireless Earbuds - White', 'ANC TWS earbuds with case', 'AudioPro', '9904-1', 'HiTech', 'Electronics', null, 4999, 3999, 3100, 900, 100, '1 Year', '8518', 18, 'CGST_SGST', 'Pcs', 55, 6, 4, 3, 10, 'Test upload - expect purchase_code 2986'],
  ['Wireless Earbuds Pro', 'Wireless Earbuds - Black', 'ANC TWS earbuds with case', 'AudioPro', '9904-2', 'HiTech', 'Electronics', null, 4999, 3999, 3150, 950, 80, '1 Year', '8518', 18, 'CGST_SGST', 'Pcs', 55, 6, 4, 3, 10, 'Test upload variant 2 - different pricing - expect purchase_code 3016'],
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
  ['product_code', 'Must be unique per warehouse', 'Format convention: NNNN-V  (e.g. 9901-1, 9901-2 for 2 variants of same product)'],
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
  addRows(ws, INSTRUCTIONS_ROWS);
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
  'length',
  'width',
  'height',
  'low_stock_threshold',
];

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
  UPLOAD_DATA_HEADERS.forEach((_, index) => {
    ws.getColumn(index + 1).width = Math.max(UPLOAD_DATA_HEADERS[index].length + 2, 14);
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
      'G2:G5000',
      `'Lists'!$A$2:$A$${categoryEndRow}`
    );
  }

  if (vendorNames.length > 0) {
    const vendorEndRow = vendorNames.length + 1;
    applyListValidation(
      uploadSheet,
      'F2:F5000',
      `'Lists'!$B$2:$B$${vendorEndRow}`
    );
  }

  applyListValidation(uploadSheet, 'Q2:Q5000', `'Lists'!$C$2:$C$${GST_TYPE_VALUES.length + 1}`);
  applyListValidation(uploadSheet, 'P2:P5000', `'Lists'!$D$2:$D$${GST_PERCENT_VALUES.length + 1}`);
  applyListValidation(uploadSheet, 'R2:R5000', `'Lists'!$E$2:$E$${UNIT_OF_MEASURE_VALUES.length + 1}`);
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
