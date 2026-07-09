const PDFDocument = require('pdfkit');

const { AppError } = require('../../errors/AppError');

const { buildTaxSummaryFromLines, roundMoney, normalizeStateCode } = require('../../utils/billing.utils');

const { getStateName } = require('../../constants/indianStateCodes');

const { amountInWords } = require('../../utils/amountInWords.utils');

const {

  M,

  R,

  W,

  MID,

  HALF,

  FIELD_SIZE,

  ROW_STEP,

  SECTION_LABEL_GAP,

  NOTE_LABEL_GAP,

  fmtNum,

  fmtMoney,

  fmtDate,

  displayVal,

  truncateProductName,

  drawLabelValue,

  drawCenteredSegments,

  drawManualUnderline,

  strokeRect,

  strokeTableGrid,

  cellText,

  drawStackedHeader,

  drawFitCellText,

  drawTableHeaderLabel,

  drawTotalLine,

  drawGstAddLine,

  drawProductCellAttributes,

} = require('../../utils/pdfTableLayout.utils');



/** Original cost transfer table columns */

const COST_COLS = [

  { label: '#', w: 22 },

  { label: 'Product / Code', w: 158, isProduct: true },

  { label: 'HSN', w: 42 },

  { label: 'Batch', w: 48 },

  { label: 'Qty', w: 30 },

  { label: 'Unit Cost', w: 54 },

  { label: 'Value', w: W - 22 - 158 - 42 - 48 - 30 - 54 },

];



const formatStateLabel = (code, { withCode = true } = {}) => {

  const normalized = normalizeStateCode(code);

  if (!normalized) return '';

  const name = getStateName(normalized);

  return withCode ? `${name} (${normalized})` : name;

};



const formatCityStateLabel = (city, stateCode, { withCode = true } = {}) => {

  const cityPart = displayVal(city);

  const statePart = formatStateLabel(stateCode, { withCode });

  if (cityPart && statePart) return `${cityPart}, ${statePart}`;

  return cityPart || statePart;

};



const getTaxRatePercents = (lines, taxMode) => {

  const taxedLine = (lines || []).find((l) => l.tax_amount > 0 && Number(l.gst_percent) > 0);

  if (!taxedLine) return { cgstPercent: 0, sgstPercent: 0, igstPercent: 0, totalPercent: 0 };

  const rate = Number(taxedLine.gst_percent) || 0;

  if (taxMode === 'IGST') {

    return { cgstPercent: 0, sgstPercent: 0, igstPercent: rate, totalPercent: rate };

  }

  const half = roundMoney(rate / 2);

  return { cgstPercent: half, sgstPercent: roundMoney(rate - half), igstPercent: 0, totalPercent: rate };

};



const resolveLineBrand = (line) => displayVal(line.brand_name);

const resolveLineWarranty = (line) => displayVal(line.warranty);



const formatGstPercent = (pct) => {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return '-';
  return n % 1 === 0 ? `${n}%` : `${n.toFixed(2)}%`;
};

const PRICE_COL_W = 55;

const buildFranchiseGstCols = () => [
  { key: 'sno', label: 'S.No.', w: 23 },
  { key: 'product', label: 'Product Name', w: 100, isProduct: true },
  { key: 'brand', label: 'Brand', w: 44 },
  { key: 'warranty', label: 'Warranty', w: 44 },
  { key: 'hsn', label: 'HSN', w: 38 },
  { key: 'gst', label: 'GST %', w: 30 },
  { key: 'qty', label: 'Qty', w: 24 },
  { key: 'mrp', label: 'MRP', w: PRICE_COL_W },
  { key: 'fprice', labelLines: ['Franchise', 'Price'], w: PRICE_COL_W },
  { key: 'lmrp', labelLines: ['Line', 'MRP'], w: PRICE_COL_W },
  { key: 'lfr', labelLines: ['Line', 'Franchise', 'Price'], w: PRICE_COL_W },
];

const buildFranchiseNonGstCols = () => [
  { key: 'sno', label: 'S.No.', w: 23 },
  { key: 'product', label: 'Product Name', w: 118, isProduct: true },
  { key: 'brand', label: 'Brand', w: 48 },
  { key: 'warranty', label: 'Warranty', w: 48 },
  { key: 'qty', label: 'Qty', w: 26 },
  { key: 'mrp', label: 'MRP', w: 65 },
  { key: 'fprice', labelLines: ['Franchise', 'Price'], w: 65 },
  { key: 'lmrp', labelLines: ['Line', 'MRP'], w: 65 },
  { key: 'lfr', labelLines: ['Line', 'Franchise', 'Price'], w: 65 },
];

const getFranchiseGstCols = () => buildFranchiseGstCols();

const getFranchiseNonGstCols = () => buildFranchiseNonGstCols();

const isPriceCol = (key) => ['mrp', 'fprice', 'lmrp', 'lfr'].includes(key);

const isCompactCol = (key) => ['sno', 'brand', 'warranty', 'hsn', 'gst', 'qty'].includes(key);

const cellValueForLine = (line, col, rowIndex) => {
  switch (col.key) {
    case 'sno':
      return String(rowIndex + 1);
    case 'brand':
      return resolveLineBrand(line);
    case 'warranty':
      return resolveLineWarranty(line);
    case 'hsn':
      return displayVal(line.hsn_code) || '-';
    case 'gst':
      return formatGstPercent(line.gst_percent);
    case 'qty':
      return String(line.quantity);
    case 'mrp':
      return fmtNum(line.unit_mrp);
    case 'fprice':
      return fmtNum(line.unit_franchise_price);
    case 'lmrp':
      return fmtNum(line.line_mrp_total);
    case 'lfr':
      return fmtNum(line.line_franchise_total);
    default:
      return '';
  }
};



const drawFranchiseTable = (pdf, startY, cols, lines, isGst) => {

  const rowH = 38;

  const headerH = 30;

  const colWidths = cols.map((c) => c.w);

  const productColIndex = cols.findIndex((c) => c.isProduct);



  const drawTableHeader = (tableY) => {

    let cx = M;

    for (const col of cols) {

      drawTableHeaderLabel(pdf, cx, tableY, col.w, headerH, col, { size: 7.5 });

      cx += col.w;

    }

  };



  const drawTableRows = (tableY, chunk, startIdx) => {

    let rowY = tableY + headerH;

    chunk.forEach((line, idx) => {

      const globalIdx = startIdx + idx;

      const name = truncateProductName(line.product_name);



      let cx = M;

      cols.forEach((col, i) => {

        if (i === productColIndex) {

          pdf.font('Helvetica').fontSize(7.5);

          pdf.text(name, cx + 3, rowY + 3, { width: Math.max(1, col.w - 6), height: 9, align: 'left' });

          const code = displayVal(line.product_code);

          if (code) {

            pdf.font('Helvetica').fontSize(6.5).fillColor('#444');

            pdf.text(code, cx + 3, rowY + 13, { width: Math.max(1, col.w - 6), align: 'left', lineBreak: false });

            pdf.fillColor('#000');

          }

          drawProductCellAttributes(pdf, cx, rowY + (code ? 22 : 13), col.w, line.attributes);

        } else if (isPriceCol(col.key)) {

          drawFitCellText(pdf, cellValueForLine(line, col, globalIdx), cx, rowY, col.w, rowH, {

            align: 'right',

            bold: false,

            size: 7.5,

          });

        } else if (isCompactCol(col.key)) {

          drawFitCellText(pdf, cellValueForLine(line, col, globalIdx), cx, rowY, col.w, rowH, {

            align: 'center',

            bold: false,

            size: 7.5,

          });

        } else {

          cellText(pdf, cellValueForLine(line, col, globalIdx), cx, rowY, col.w, rowH, {

            align: 'center',

            bold: false,

            size: 7.5,

          });

        }

        cx += col.w;

      });

      rowY += rowH;

    });

    return rowY;

  };



  const tableStartY = startY;

  const itemsPerPage = Math.max(1, Math.floor((620 - tableStartY - headerH) / rowH));

  let itemIdx = 0;

  let y = startY;



  if (!lines.length) {

    strokeTableGrid(pdf, M, y, colWidths, headerH, rowH, 0);

    drawTableHeader(y);

    return y + headerH;

  }



  while (itemIdx < lines.length) {

    const chunk = lines.slice(itemIdx, itemIdx + itemsPerPage);

    const pageTableY = itemIdx === 0 ? tableStartY : M;

    strokeTableGrid(pdf, M, pageTableY, colWidths, headerH, rowH, chunk.length);

    drawTableHeader(pageTableY);

    y = drawTableRows(pageTableY, chunk, itemIdx);

    itemIdx += chunk.length;

    if (itemIdx < lines.length) pdf.addPage();

  }



  return y;

};



const drawShopStyleFooter = (pdf, y, doc, { isGst, issuerName, totals, lines }) => {

  const gstSplit = buildTaxSummaryFromLines(lines);

  const taxRates = getTaxRatePercents(lines, gstSplit.tax_mode);

  const mrpDiscount = Number(totals.discount) || 0;

  const subTotal = Number(totals.mrp_subtotal) || 0;

  const taxableAmount = Number(totals.taxable_amount) || 0;

  const gstAmount = Number(totals.gst_amount) || 0;

  const finalAmount = Number(totals.final_amount) || 0;



  const finH = isGst ? 118 : 68;

  strokeRect(pdf, M, y, W, finH);



  const tx = MID + 8;

  const tw = HALF - 16;

  let ty = y + 8;



  ty = drawTotalLine(pdf, tx, ty, tw, 'Sub Total', fmtNum(subTotal));

  if (mrpDiscount > 0) {

    ty = drawTotalLine(pdf, tx, ty, tw, 'MRP Discount', `- ${fmtNum(mrpDiscount)}`);

  }



  if (isGst) {

    ty = drawTotalLine(pdf, tx, ty, tw, 'Total Amount', fmtNum(taxableAmount));



    if (gstSplit.tax_mode === 'CGST_SGST') {

      if (gstSplit.cgst > 0) {

        ty = drawGstAddLine(pdf, tx, ty, tw, `CGST (${taxRates.cgstPercent}%)`, `+ ${fmtNum(gstSplit.cgst)}`);

      }

      if (gstSplit.sgst > 0) {

        ty = drawGstAddLine(pdf, tx, ty, tw, `SGST (${taxRates.sgstPercent}%)`, `+ ${fmtNum(gstSplit.sgst)}`);

      }

    } else if (gstSplit.igst > 0) {

      ty = drawGstAddLine(pdf, tx, ty, tw, `IGST (${taxRates.igstPercent}%)`, `+ ${fmtNum(gstSplit.igst)}`);

    }



    if (gstAmount > 0) {

      ty = drawTotalLine(pdf, tx, ty, tw, `Total Tax Amount (${taxRates.totalPercent}%)`, fmtNum(gstAmount));

      ty += 2;

    }

  }



  pdf.moveTo(tx, ty).lineTo(tx + tw, ty).stroke();

  ty += 8;

  pdf.font('Helvetica-Bold').fontSize(11);

  pdf.text('Total Payable Amount', tx, ty, { width: 150, align: 'left' });

  pdf.font('Helvetica').fontSize(11);

  pdf.text(fmtMoney(finalAmount), tx + 150, ty, { width: tw - 150, align: 'right' });



  y += finH;



  const wordsPadTop = 6;

  const wordsH = 32;

  strokeRect(pdf, M, y, W, wordsH);

  pdf.fontSize(8).font('Helvetica-Bold').text('Total Amount (in words) :', M + 6, y + wordsPadTop);

  pdf.font('Helvetica').fontSize(8);

  pdf.text(amountInWords(finalAmount), M + 6, y + wordsPadTop + SECTION_LABEL_GAP, {

    width: W - 12,

    lineGap: 1,

  });

  y += wordsH;



  const declPadTop = 6;

  const declH = 40;

  strokeRect(pdf, M, y, W, declH);

  pdf.fontSize(8).font('Helvetica-Bold').text('Declaration :', M + 6, y + declPadTop);

  pdf.font('Helvetica').fontSize(7);

  pdf.text(

    'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',

    M + 6,

    y + declPadTop + SECTION_LABEL_GAP,

    { width: W - 12, lineGap: 1 }

  );

  y += declH;



  const footH = 72;

  strokeRect(pdf, M, y, W, footH);

  pdf.moveTo(MID, y).lineTo(MID, y + footH).stroke();



  const rx = MID;

  const colW = HALF;

  const footPadTop = 6;



  if (!isGst) {

    pdf.fontSize(7.5).font('Helvetica-Bold').text('Note:', M + 6, y + footPadTop);

    pdf.font('Helvetica').fontSize(7);

    pdf.text('1. Keep the bill for warranty or guarantee purpose.', M + 6, y + footPadTop + NOTE_LABEL_GAP, {

      width: HALF - 12,

      lineGap: 1,

    });

  } else {

    pdf.fontSize(7.5).font('Helvetica-Bold').text('Terms & Conditions :', M + 6, y + footPadTop);

    pdf.font('Helvetica').fontSize(7);

    const terms = [

      '1. E. & O.E.',

      '2. Subject to local jurisdiction only.',

      '3. Keep the bill for warranty or guarantee purpose.',

    ];

    let tcy = y + footPadTop + SECTION_LABEL_GAP;

    for (const t of terms) {

      pdf.text(t, M + 6, tcy, { width: HALF - 12, lineGap: 1 });

      tcy += ROW_STEP;

    }

  }



  pdf.fontSize(8).font('Helvetica-Bold').text(`For ${issuerName || 'Warehouse'}`, rx + 6, y + 6);

  const stampX = rx + colW - 62;

  const stampY = y + 18;

  pdf.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#999');

  pdf.rect(stampX, stampY, 48, 36).stroke();

  pdf.undash().restore();

  pdf.fontSize(6.5).font('Helvetica').fillColor('#888');

  pdf.text('Seal / Stamp', stampX, stampY + 14, { width: 48, align: 'center' });

  pdf.fillColor('#000');

  pdf.moveTo(rx + 6, y + footH - 14).lineTo(R - 8, y + footH - 14).stroke();

  pdf.fontSize(7).font('Helvetica-Oblique').text('Authorised Signatory', rx + 6, y + footH - 12);



  y += footH + 8;

  pdf.fontSize(7).font('Helvetica-Oblique').fillColor('#666');

  pdf.text('This is a computer generated invoice.', M, y, { width: W, align: 'center' });

  pdf.fillColor('#000').font('Helvetica');



  return y;

};



const buildFranchiseBillPdf = (pdf, doc) => {

  const totals = doc.franchise_bill_totals || {};

  const issuer = doc.issuer || {};

  const recipient = doc.recipient || {};

  const lines = doc.lines || [];

  const isGst = doc.transfer_bill_type === 'GST_INVOICE';

  const issuerName = issuer.name || doc.from_label || 'Warehouse';



  let y = M;



  if (isGst && issuer.gstin) {

    drawLabelValue(pdf, M, y, 'GSTIN', issuer.gstin, HALF);

    pdf.fontSize(7.5).font('Helvetica').text('Original / Duplicate / Triplicate', M, y, {

      width: W,

      align: 'right',

    });

    y += 16;

  } else {

    y += 4;

  }



  if (isGst) {

    const gstTitleSize = 11;

    pdf.fontSize(gstTitleSize).font('Helvetica-Bold');

    const gstTitle = 'GST INVOICE';

    const gstTitleW = pdf.widthOfString(gstTitle);

    const gstTitleX = M + (W - gstTitleW) / 2;

    pdf.text(gstTitle, gstTitleX, y, { lineBreak: false });

    drawManualUnderline(pdf, gstTitleX, y, gstTitle, { size: gstTitleSize, offset: 12 });

    y += 18;

  }



  pdf.fontSize(16).font('Helvetica-Bold');

  pdf.text(issuerName, M, y, { width: W, align: 'center' });

  y += 18;

  drawCenteredSegments(pdf, y, [

    { text: 'Location ID : ', bold: true },

    { text: displayVal(issuer.code), bold: false },

    { text: '  |  Name : ', bold: true },

    { text: displayVal(issuer.name), bold: false },

  ]);

  y += 12;

  const addrParts = [issuer.address, issuer.city].filter(Boolean).join(', ');

  if (addrParts) {

    pdf.fontSize(FIELD_SIZE).font('Helvetica').text(addrParts, M, y, { width: W, align: 'center' });

    y += 11;

  }

  if (issuer.manager_name) {

    pdf.fontSize(FIELD_SIZE).font('Helvetica').text(`Manager : ${issuer.manager_name}`, M, y, {

      width: W,

      align: 'center',

    });

    y += 12;

  }



  pdf.moveTo(M, y).lineTo(R, y).strokeColor('#333').lineWidth(0.75).stroke();

  y += 4;



  const infoH = 120;

  strokeRect(pdf, M, y, W, infoH);

  pdf.moveTo(MID, y).lineTo(MID, y + infoH).strokeColor('#333').lineWidth(0.6).stroke();



  const lx = M;

  const rx = MID;

  const colW = HALF;



  const billToX = lx + 6;

  const billToY = y + 5;

  pdf.fontSize(FIELD_SIZE).font('Helvetica-Bold');

  const billToText = 'Bill To';

  pdf.text(billToText, billToX, billToY, { lineBreak: false });

  drawManualUnderline(pdf, billToX, billToY, billToText);

  pdf.text(' :', billToX + pdf.widthOfString(billToText), billToY, { lineBreak: false });



  let ly = y + 19;

  pdf.fontSize(FIELD_SIZE).font('Helvetica');

  const billToName = isGst

    ? recipient.legal_name || recipient.name || doc.to_label

    : recipient.name || doc.to_label;

  if (isGst) {

    drawLabelValue(pdf, lx + 6, ly, 'M/S', billToName, colW - 12);

    ly += 11;

  } else {

    pdf.text(displayVal(billToName), lx + 6, ly, { width: colW - 12 });

    ly += 11;

  }

  if (recipient.address) {

    pdf.text(recipient.address, lx + 6, ly, { width: colW - 12 });

    ly += 11;

  }

  const recipientCity = [recipient.city, recipient.pincode].filter(Boolean).join(', ');

  if (recipientCity) {

    pdf.text(recipientCity, lx + 6, ly, { width: colW - 12 });

    ly += 11;

  }

  drawLabelValue(pdf, lx + 6, ly, 'Mobile', recipient.phone, colW - 12);

  ly += 11;

  if (isGst) {

    drawLabelValue(pdf, lx + 6, ly, 'GSTIN', recipient.gstin, colW - 12);

    ly += 11;

    drawLabelValue(pdf, lx + 6, ly, 'State', formatStateLabel(recipient.state_code), colW - 12);

  }



  const dispatchCode = normalizeStateCode(issuer.state_code);

  const supplyCode = normalizeStateCode(recipient.state_code);

  const posName = displayVal(formatCityStateLabel(recipient.city, supplyCode, { withCode: isGst }));

  const dispatchName = displayVal(formatCityStateLabel(issuer.city, dispatchCode, { withCode: isGst }));



  const rxPad = rx + 6;

  const rxW = colW - 12;

  let ry = y + 14;

  drawLabelValue(pdf, rxPad, ry, 'Invoice No', doc.document_number, rxW);

  ry += 11;

  drawLabelValue(pdf, rxPad, ry, 'Date', fmtDate(doc.document_date), rxW);

  ry += 11;

  drawLabelValue(pdf, rxPad, ry, 'E-Way Bill No', doc.tracking_number || '', rxW);

  ry += 11;

  drawLabelValue(pdf, rxPad, ry, 'Place of Supply', posName, rxW);

  ry += 11;

  drawLabelValue(pdf, rxPad, ry, 'Place of Dispatch', dispatchName, rxW);

  ry += 11;

  drawLabelValue(pdf, rxPad, ry, 'Transport', '', rxW);

  ry += 11;



  const payFontSize = 9;

  const payBoxH = 20;

  const payBoxY = ry + 6;

  strokeRect(pdf, rx + 6, payBoxY, colW - 12, payBoxH);

  drawLabelValue(pdf, rx + 10, payBoxY + 6, 'Mode of Payment', 'Stock Transfer', colW - 20, payFontSize);



  y += infoH;



  const cols = isGst ? getFranchiseGstCols() : getFranchiseNonGstCols();

  y = drawFranchiseTable(pdf, y, cols, lines, isGst);

  y = drawShopStyleFooter(pdf, y, doc, { isGst, issuerName, totals, lines });



  if (doc.remarks) {

    pdf.fontSize(7).font('Helvetica').text(`Remarks: ${doc.remarks}`, M, pdf.y, { width: W });

  }

};



const productCodeLabel = (line) => {

  const name = displayVal(line.product_name) || '-';

  const code = displayVal(line.product_code);

  return code ? `${name} / ${code}` : name;

};



const buildCostChallanPdf = (pdf, doc) => {

  const issuerName = doc.issuer?.name || doc.from_label || 'Warehouse';

  const lines = doc.lines || [];



  let totalQty = 0;

  let totalValue = 0;

  for (const line of lines) {

    totalQty += Number(line.quantity) || 0;

    totalValue += Number(line.line_value) || 0;

  }



  const { drawTransferHeader, drawTransferFooter, drawPaginatedTable } = require('../../utils/pdfTableLayout.utils');

  let y = drawTransferHeader(pdf, doc);



  y = drawPaginatedTable(

    pdf,

    y,

    COST_COLS,

    lines,

    (line, idx) => ({

      productName: line.product_name,

      productSku: line.product_code || line.sku,

      cells: [

        String(idx + 1),

        productCodeLabel(line),

        displayVal(line.hsn_code) || '-',

        displayVal(line.batch_number) || '-',

        String(line.quantity),

        line.unit_cost != null ? fmtNum(line.unit_cost) : '-',

        line.line_value != null ? fmtNum(line.line_value) : '-',

      ],

    }),

    { productWithSku: true }

  );



  const finH = 52;

  strokeRect(pdf, M, y, W, finH);



  pdf.font('Helvetica-Bold').fontSize(8);

  pdf.text(`Total Quantity: ${totalQty}`, M + 8, y + 10);



  const tx = MID + 8;

  const tw = HALF - 16;

  let ty = y + 8;

  if (totalValue > 0) {

    drawTotalLine(pdf, tx, ty, tw, 'Total Transfer Value (at cost)', fmtMoney(totalValue));

  }



  y += finH;

  drawTransferFooter(pdf, y, issuerName, { totalAmount: totalValue });



  if (doc.remarks) {

    pdf.fontSize(7).font('Helvetica').text(`Remarks: ${doc.remarks}`, M, pdf.y, { width: W });

  }

};



const buildTransferChallanPdfBuffer = (doc) =>

  new Promise((resolve, reject) => {

    try {

      const pdf = new PDFDocument({ margin: M, size: 'A4' });

      const chunks = [];

      pdf.on('data', (c) => chunks.push(c));

      pdf.on('end', () => resolve(Buffer.concat(chunks)));

      pdf.on('error', reject);



      if (doc.bill_format === 'FRANCHISE_TRANSFER_BILL' || doc.bill_format === 'FRANCHISE' || doc.is_franchise_bill) {

        buildFranchiseBillPdf(pdf, doc);

      } else {

        buildCostChallanPdf(pdf, doc);

      }



      pdf.end();

    } catch (err) {

      reject(err);

    }

  });



const generateTransferChallanPdf = async (challanDoc) => {

  if (!challanDoc?.lines?.length) {

    throw new AppError('Challan has no line items to print', 400, 'CHALLAN_EMPTY');

  }

  const buffer = await buildTransferChallanPdfBuffer(challanDoc);

  return { buffer, contentType: 'application/pdf' };

};



module.exports = {

  buildTransferChallanPdfBuffer,

  generateTransferChallanPdf,

};


