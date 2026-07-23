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

  drawCenteredKeyedPairs,

  drawManualUnderline,

  strokeRect,

  strokeTableGrid,

  cellText,

  drawStackedHeader,

  drawFitCellText,

  drawWrappedCellText,

  drawTableHeaderLabel,

  drawWrappedTextBlock,

  drawLabelValueBlock,

  measureWrappedTextBlock,

  measureLabelValueBlock,

  drawTotalLine,

  drawGstAddLine,

  drawProductCellAttributes,

} = require('../../utils/pdfTableLayout.utils');

/** Bill To / invoice meta + post-payable footer — +1pt vs default FIELD_SIZE (8). */
const DETAIL_SIZE = FIELD_SIZE + 1;



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
  { key: 'special', labelLines: ['Spl/Sale', 'Price'], w: PRICE_COL_W },
  // Stacked like old bills — full "Franchise Price" without shrinking font.
  { key: 'fprice', labelLines: ['Franchise', 'Price'], w: PRICE_COL_W },
  { key: 'tfprice', labelLines: ['Total', 'Franchise', 'Price'], w: PRICE_COL_W },
];

const buildFranchiseNonGstCols = () => [
  { key: 'sno', label: 'S.No.', w: 23 },
  { key: 'product', label: 'Product Name', w: 118, isProduct: true },
  { key: 'brand', label: 'Brand', w: 48 },
  { key: 'warranty', label: 'Warranty', w: 48 },
  { key: 'qty', label: 'Qty', w: 26 },
  { key: 'mrp', label: 'MRP', w: 65 },
  { key: 'special', labelLines: ['Spl/Sale', 'Price'], w: 65 },
  { key: 'fprice', labelLines: ['Franchise', 'Price'], w: 65 },
  { key: 'tfprice', labelLines: ['Total', 'Franchise', 'Price'], w: 65 },
];

const getFranchiseGstCols = () => buildFranchiseGstCols();

const getFranchiseNonGstCols = () => buildFranchiseNonGstCols();

const isPriceCol = (key) => ['mrp', 'special', 'fprice', 'tfprice'].includes(key);

/** Short numeric / code cols — single line, may shrink slightly. */
const isCompactCol = (key) => ['sno', 'hsn', 'gst', 'qty'].includes(key);

/** Text cols that must keep font size and wrap to next line. */
const isWrapTextCol = (key) => ['brand', 'warranty'].includes(key);

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
    case 'special':
      return fmtNum(line.unit_special_price);
    case 'fprice':
      return fmtNum(line.unit_franchise_price);
    case 'tfprice':
      return fmtNum(line.line_franchise_total);
    default:
      return '';
  }
};



const drawFranchiseTable = (pdf, startY, cols, lines, isGst) => {

  const cellSize = DETAIL_SIZE;
  const rowH = 40;

  // Stacked headers (Total / Franchise / Price) at DETAIL_SIZE.
  const headerH = 38;

  const colWidths = cols.map((c) => c.w);

  const productColIndex = cols.findIndex((c) => c.isProduct);



  const drawTableHeader = (tableY) => {

    let cx = M;

    for (const col of cols) {

      drawTableHeaderLabel(pdf, cx, tableY, col.w, headerH, col, { size: cellSize });

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

          pdf.font('Helvetica').fontSize(cellSize);

          pdf.text(name, cx + 3, rowY + 3, { width: Math.max(1, col.w - 6), height: 11, align: 'left' });

          const code = displayVal(line.product_code);

          if (code) {

            pdf.font('Helvetica').fontSize(cellSize - 1).fillColor('#444');

            pdf.text(code, cx + 3, rowY + 14, { width: Math.max(1, col.w - 6), align: 'left', lineBreak: false });

            pdf.fillColor('#000');

          }

          drawProductCellAttributes(pdf, cx, rowY + (code ? 24 : 14), col.w, line.attributes, {
            size: cellSize - 1.5,
          });

        } else if (isPriceCol(col.key)) {

          drawFitCellText(pdf, cellValueForLine(line, col, globalIdx), cx, rowY, col.w, rowH, {

            align: 'right',

            bold: false,

            size: cellSize,

          });

        } else if (isWrapTextCol(col.key)) {

          drawWrappedCellText(pdf, cellValueForLine(line, col, globalIdx), cx, rowY, col.w, rowH, {

            align: 'center',

            bold: false,

            size: cellSize,

          });

        } else if (isCompactCol(col.key)) {

          drawFitCellText(pdf, cellValueForLine(line, col, globalIdx), cx, rowY, col.w, rowH, {

            align: 'center',

            bold: false,

            size: cellSize,

          });

        } else {

          cellText(pdf, cellValueForLine(line, col, globalIdx), cx, rowY, col.w, rowH, {

            align: 'center',

            bold: false,

            size: cellSize,

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



const drawShopStyleFooter = (pdf, y, doc, { isGst, isEstimate = false, issuerName, totals, lines }) => {

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



  ty = drawTotalLine(pdf, tx, ty, tw, 'Sub Total', fmtNum(subTotal), {
    labelSize: DETAIL_SIZE,
    valueSize: DETAIL_SIZE,
  });

  if (mrpDiscount > 0) {

    ty = drawTotalLine(pdf, tx, ty, tw, 'MRP Discount', `- ${fmtNum(mrpDiscount)}`, {
      labelSize: DETAIL_SIZE,
      valueSize: DETAIL_SIZE,
    });

  }



  if (isGst) {

    ty = drawTotalLine(pdf, tx, ty, tw, 'Total Amount', fmtNum(taxableAmount), {
      labelSize: DETAIL_SIZE,
      valueSize: DETAIL_SIZE,
    });



    if (gstSplit.tax_mode === 'CGST_SGST') {

      if (gstSplit.cgst > 0) {

        ty = drawGstAddLine(pdf, tx, ty, tw, `CGST (${taxRates.cgstPercent}%)`, `+ ${fmtNum(gstSplit.cgst)}`, {
          size: DETAIL_SIZE,
        });

      }

      if (gstSplit.sgst > 0) {

        ty = drawGstAddLine(pdf, tx, ty, tw, `SGST (${taxRates.sgstPercent}%)`, `+ ${fmtNum(gstSplit.sgst)}`, {
          size: DETAIL_SIZE,
        });

      }

    } else if (gstSplit.igst > 0) {

      ty = drawGstAddLine(pdf, tx, ty, tw, `IGST (${taxRates.igstPercent}%)`, `+ ${fmtNum(gstSplit.igst)}`, {
        size: DETAIL_SIZE,
      });

    }



    if (gstAmount > 0) {

      ty = drawTotalLine(
        pdf,
        tx,
        ty,
        tw,
        `Total Tax Amount (${taxRates.totalPercent}%)`,
        fmtNum(gstAmount),
        { labelSize: DETAIL_SIZE, valueSize: DETAIL_SIZE }
      );

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

  const wordsH = 36;

  strokeRect(pdf, M, y, W, wordsH);

  pdf.fontSize(9).font('Helvetica-Bold').text('Total Amount (in words) :', M + 6, y + wordsPadTop);

  pdf.font('Helvetica').fontSize(9);

  pdf.text(amountInWords(finalAmount), M + 6, y + wordsPadTop + SECTION_LABEL_GAP, {

    width: W - 12,

    lineGap: 1,

  });

  y += wordsH;

  if (!isEstimate) {
    const declPadTop = 6;
    const declH = 44;
    strokeRect(pdf, M, y, W, declH);
    pdf.fontSize(9).font('Helvetica-Bold').text('Declaration :', M + 6, y + declPadTop);
    pdf.font('Helvetica').fontSize(8);
    pdf.text(
      'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
      M + 6,
      y + declPadTop + SECTION_LABEL_GAP,
      { width: W - 12, lineGap: 1 }
    );
    y += declH;

    const footH = 76;
    strokeRect(pdf, M, y, W, footH);
    pdf.moveTo(MID, y).lineTo(MID, y + footH).stroke();

    const rx = MID;
    const colW = HALF;
    const footPadTop = 6;

    if (!isGst) {
      pdf.fontSize(8.5).font('Helvetica-Bold').text('Note:', M + 6, y + footPadTop);
      pdf.font('Helvetica').fontSize(8);
      pdf.text('1. Keep the bill for warranty or guarantee purpose.', M + 6, y + footPadTop + NOTE_LABEL_GAP, {
        width: HALF - 12,
        lineGap: 1,
      });
    } else {
      pdf.fontSize(8.5).font('Helvetica-Bold').text('Terms & Conditions :', M + 6, y + footPadTop);
      pdf.font('Helvetica').fontSize(8);
      const terms = [
        '1. E. & O.E.',
        '2. Subject to local jurisdiction only.',
        '3. Keep the bill for warranty or guarantee purpose.',
      ];
      let tcy = y + footPadTop + SECTION_LABEL_GAP;
      for (const t of terms) {
        pdf.text(t, M + 6, tcy, { width: HALF - 12, lineGap: 1 });
        tcy += ROW_STEP + 1;
      }
    }

    pdf.fontSize(9).font('Helvetica-Bold').text(`For ${issuerName || 'Warehouse'}`, rx + 6, y + 6);
    const stampX = rx + colW - 62;
    const stampY = y + 18;
    pdf.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#999');
    pdf.rect(stampX, stampY, 48, 36).stroke();
    pdf.undash().restore();
    pdf.fontSize(7.5).font('Helvetica').fillColor('#888');
    pdf.text('Seal / Stamp', stampX, stampY + 14, { width: 48, align: 'center' });
    pdf.fillColor('#000');
    pdf.moveTo(rx + 6, y + footH - 14).lineTo(R - 8, y + footH - 14).stroke();
    pdf.fontSize(8).font('Helvetica-Oblique').text('Authorised Signatory', rx + 6, y + footH - 12);

    y += footH + 8;
  } else {
    y += 8;
  }

  pdf.fontSize(8).font('Helvetica-Oblique').fillColor('#666');
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
  const isEstimate = doc.transfer_bill_type === 'ESTIMATE_INVOICE';
  const issuerName = issuer.name || doc.from_label || 'Warehouse';

  let y = M;

  const headerLineGap = 15;

  if (isGst && issuer.gstin) {
    drawLabelValue(pdf, M, y, 'GSTIN', issuer.gstin, HALF, DETAIL_SIZE);
    pdf.fontSize(DETAIL_SIZE).font('Helvetica').text('Original / Duplicate / Triplicate', M, y, {
      width: W,
      align: 'right',
    });
    y += 18;
  } else if (!isEstimate) {
    y += 6;
  } else {
    y += 4;
  }

  // Title above company name: GST INVOICE / Invoice / Receipt
  if (isEstimate) {
    pdf.fontSize(16).font('Helvetica-Bold');
    pdf.text('Receipt', M, y, { width: W, align: 'center' });
    y += 34;
  } else {
    const billTitle = isGst ? 'GST INVOICE' : 'Invoice';
    const billTitleSize = 11;
    pdf.fontSize(billTitleSize).font('Helvetica-Bold');
    const billTitleW = pdf.widthOfString(billTitle);
    const billTitleX = M + (W - billTitleW) / 2;
    pdf.text(billTitle, billTitleX, y, { lineBreak: false });
    drawManualUnderline(pdf, billTitleX, y, billTitle, { size: billTitleSize, offset: 12 });
    // Extra space between title and company name
    y += 22;

    pdf.fontSize(16).font('Helvetica-Bold');
    pdf.text(issuerName, M, y, { width: W, align: 'center' });
    y += 20;

    y = drawCenteredKeyedPairs(
      pdf,
      y,
      [
        { label: 'Location ID : ', value: displayVal(issuer.code) || '—' },
        { label: 'Location Name : ', value: displayVal(issuer.location_name || issuer.name) || '—' },
      ],
      { size: DETAIL_SIZE, lineGap: headerLineGap }
    );

    // Header address only — do not append city (often already inside the address text).
    const addrParts = displayVal(issuer.address);
    if (addrParts) {
      pdf.fontSize(DETAIL_SIZE).font('Helvetica');
      const addrH = pdf.heightOfString(addrParts, { width: W, align: 'center', lineGap: 2 });
      pdf.text(addrParts, M, y, { width: W, align: 'center', lineGap: 2 });
      y += Math.max(headerLineGap, addrH + 4);
    }

    const contactPairs = [];
    if (displayVal(issuer.phone)) {
      contactPairs.push({ label: 'Phone : ', value: displayVal(issuer.phone) });
    }
    if (displayVal(issuer.email)) {
      contactPairs.push({ label: 'Email : ', value: displayVal(issuer.email) });
    }
    if (contactPairs.length) {
      y = drawCenteredKeyedPairs(pdf, y, contactPairs, {
        size: DETAIL_SIZE,
        lineGap: headerLineGap,
      });
    }
  }



  pdf.moveTo(M, y).lineTo(R, y).strokeColor('#333').lineWidth(0.75).stroke();

  y += 4;

  const lx = M;

  const rx = MID;

  const colW = HALF;

  const billToName = isGst
    ? recipient.legal_name || recipient.name || doc.to_label
    : recipient.name || doc.to_label;

  const textW = colW - 12;
  const leftStartY = y + 20;
  let leftContentH = isGst
    ? measureLabelValueBlock(pdf, 'M/S', billToName, textW, DETAIL_SIZE)
    : measureWrappedTextBlock(pdf, billToName, textW, { size: DETAIL_SIZE });
  leftContentH += measureWrappedTextBlock(pdf, recipient.address, textW, { size: DETAIL_SIZE });
  leftContentH += measureWrappedTextBlock(
    pdf,
    [recipient.city, recipient.pincode].filter(Boolean).join(', '),
    textW,
    { size: DETAIL_SIZE }
  );
  leftContentH += measureLabelValueBlock(pdf, 'Mobile', recipient.phone, textW, DETAIL_SIZE);
  if (isGst) {
    leftContentH += measureLabelValueBlock(pdf, 'GSTIN', recipient.gstin, textW, DETAIL_SIZE);
    leftContentH += measureLabelValueBlock(
      pdf,
      'State',
      formatStateLabel(recipient.state_code),
      textW,
      DETAIL_SIZE
    );
  }

  const dispatchCode = normalizeStateCode(issuer.state_code);
  const supplyCode = normalizeStateCode(recipient.state_code);
  // Place of Supply / Dispatch: city + state name only (no GST state code).
  // State code stays only in Bill To → State.
  const posName = displayVal(formatCityStateLabel(recipient.city, supplyCode, { withCode: false }));
  const dispatchName = displayVal(formatCityStateLabel(issuer.city, dispatchCode, { withCode: false }));
  const dispatchedBy = displayVal(issuer.manager_name);

  const rightStartY = y + 14;
  const rxMeasureW = colW - 12;
  let rightContentH = 0;
  rightContentH += measureLabelValueBlock(pdf, 'Invoice No', doc.document_number, rxMeasureW, DETAIL_SIZE);
  rightContentH += measureLabelValueBlock(pdf, 'Date', fmtDate(doc.document_date), rxMeasureW, DETAIL_SIZE);
  rightContentH += measureLabelValueBlock(pdf, 'E-Way Bill No', doc.tracking_number || '', rxMeasureW, DETAIL_SIZE);
  rightContentH += measureLabelValueBlock(pdf, 'Place of Supply', posName, rxMeasureW, DETAIL_SIZE);
  rightContentH += measureLabelValueBlock(pdf, 'Place of Dispatch', dispatchName, rxMeasureW, DETAIL_SIZE);
  if (dispatchedBy) {
    rightContentH += measureLabelValueBlock(pdf, 'Dispatched by', dispatchedBy, rxMeasureW, DETAIL_SIZE);
  }
  rightContentH += measureLabelValueBlock(pdf, 'Transport', '', rxMeasureW, DETAIL_SIZE);
  rightContentH += 28; // payment box + gap

  const infoH = Math.max(120, Math.ceil(Math.max(
    leftStartY - y + leftContentH,
    rightStartY - y + rightContentH
  )));

  strokeRect(pdf, M, y, W, infoH);

  pdf.moveTo(MID, y).lineTo(MID, y + infoH).strokeColor('#333').lineWidth(0.6).stroke();



  const billToX = lx + 6;

  const billToY = y + 5;

  pdf.fontSize(DETAIL_SIZE).font('Helvetica-Bold');

  const billToText = 'Bill To';

  pdf.text(billToText, billToX, billToY, { lineBreak: false });

  drawManualUnderline(pdf, billToX, billToY, billToText, { size: DETAIL_SIZE });

  pdf.text(' :', billToX + pdf.widthOfString(billToText), billToY, { lineBreak: false });



  let ly = leftStartY;

  pdf.fontSize(DETAIL_SIZE).font('Helvetica');

  if (isGst) {
    ly = drawLabelValueBlock(pdf, lx + 6, ly, 'M/S', billToName, textW, DETAIL_SIZE);
  } else {
    ly = drawWrappedTextBlock(pdf, lx + 6, ly, billToName, textW, { size: DETAIL_SIZE });
  }

  if (recipient.address) {
    ly = drawWrappedTextBlock(pdf, lx + 6, ly, recipient.address, textW, { size: DETAIL_SIZE });
  }

  const recipientCity = [recipient.city, recipient.pincode].filter(Boolean).join(', ');

  if (recipientCity) {
    ly = drawWrappedTextBlock(pdf, lx + 6, ly, recipientCity, textW, { size: DETAIL_SIZE });
  }

  ly = drawLabelValueBlock(pdf, lx + 6, ly, 'Mobile', recipient.phone, textW, DETAIL_SIZE);

  if (isGst) {
    ly = drawLabelValueBlock(pdf, lx + 6, ly, 'GSTIN', recipient.gstin, textW, DETAIL_SIZE);
    ly = drawLabelValueBlock(pdf, lx + 6, ly, 'State', formatStateLabel(recipient.state_code), textW, DETAIL_SIZE);
  }



  const rxPad = rx + 6;

  const rxW = colW - 12;

  let ry = y + 14;

  ry = drawLabelValueBlock(pdf, rxPad, ry, 'Invoice No', doc.document_number, rxW, DETAIL_SIZE);
  ry = drawLabelValueBlock(pdf, rxPad, ry, 'Date', fmtDate(doc.document_date), rxW, DETAIL_SIZE);
  ry = drawLabelValueBlock(pdf, rxPad, ry, 'E-Way Bill No', doc.tracking_number || '', rxW, DETAIL_SIZE);
  ry = drawLabelValueBlock(pdf, rxPad, ry, 'Place of Supply', posName, rxW, DETAIL_SIZE);
  ry = drawLabelValueBlock(pdf, rxPad, ry, 'Place of Dispatch', dispatchName, rxW, DETAIL_SIZE);
  if (dispatchedBy) {
    ry = drawLabelValueBlock(pdf, rxPad, ry, 'Dispatched by', dispatchedBy, rxW, DETAIL_SIZE);
  }
  ry = drawLabelValueBlock(pdf, rxPad, ry, 'Transport', '', rxW, DETAIL_SIZE);



  const payFontSize = DETAIL_SIZE + 1;

  const payBoxH = 22;

  const payBoxY = Math.min(ry + 4, y + infoH - payBoxH - 4);

  strokeRect(pdf, rx + 6, payBoxY, colW - 12, payBoxH);

  drawLabelValue(pdf, rx + 10, payBoxY + 6, 'Mode of Payment', '', colW - 20, payFontSize);



  y += infoH;



  const cols = isGst ? getFranchiseGstCols() : getFranchiseNonGstCols();
  y = drawFranchiseTable(pdf, y, cols, lines, isGst);
  y = drawShopStyleFooter(pdf, y, doc, { isGst, isEstimate, issuerName, totals, lines });
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


