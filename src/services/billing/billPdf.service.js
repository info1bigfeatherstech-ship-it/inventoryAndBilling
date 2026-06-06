const PDFDocument = require('pdfkit');
const { v2: cloudinary } = require('cloudinary');
const config = require('../../config/index.config');
const { AppError } = require('../../errors/AppError');
const {
  buildTaxSummaryFromLines,
  roundMoney,
  normalizeStateCode,
} = require('../../utils/billing.utils');
const { getStateName } = require('../../constants/indianStateCodes');
const { amountInWords } = require('../../utils/amountInWords.utils');
const { maskAccountNumber } = require('../../utils/shopBank.utils');

const M = 36;
const R = 559;
const W = R - M;
const MID = M + W / 2;
const HALF = W / 2;

const trimEnv = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

const safeNum = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

/** PDFKit throws on NaN coordinates — clamp layout dimensions. */
const safeDim = (n, fallback = 0) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
};

const fmtNum = (n) =>
  safeNum(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** PDFKit underline:true can throw NaN — draw a manual rule instead. */
const drawManualUnderline = (doc, x, y, text, { size = FIELD_SIZE, offset = 9 } = {}) => {
  const w = doc.widthOfString(text);
  doc.save().strokeColor('#000').lineWidth(0.5);
  doc.moveTo(x, y + offset).lineTo(x + w, y + offset).stroke();
  doc.restore();
};

const fmtMoney = (n) => `Rs. ${fmtNum(n)}`;

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN');

const FIELD_SIZE = 8;

/** Stacked row spacing (totals, bank rows, bill-to fields). */
const ROW_STEP = 13;
/** Bold section label → body text (amount in words, declaration, GST terms). */
const SECTION_LABEL_GAP = 12;
/** Note: → warranty line — slightly more than other sections. */
const NOTE_LABEL_GAP = 14;

/** Blank fields stay empty — no dash placeholder. */
const displayVal = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s;
};

/** Bold label + regular value on one line. */
const drawLabelValue = (doc, x, y, label, value, maxW = 240, size = FIELD_SIZE) => {
  doc.fontSize(size).font('Helvetica-Bold');
  const labelText = `${label} : `;
  const labelW = doc.widthOfString(labelText);
  doc.text(labelText, x, y, { lineBreak: false });
  doc.font('Helvetica').fontSize(size).text(displayVal(value), x + labelW, y, {
    width: Math.max(20, maxW - labelW),
    lineBreak: false,
  });
};

/** Centered line with multiple bold-label / regular-value segments. */
const drawCenteredSegments = (doc, y, segments) => {
  let totalW = 0;
  const sized = segments.map((seg) => {
    doc.font(seg.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(seg.size || FIELD_SIZE);
    const w = doc.widthOfString(seg.text);
    totalW += w;
    return { ...seg, w };
  });
  let sx = M + (W - totalW) / 2;
  for (const seg of sized) {
    doc.font(seg.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(seg.size || FIELD_SIZE);
    doc.text(seg.text, sx, y, { lineBreak: false });
    sx += seg.w;
  }
};

const lineMrp = (item) => {
  const mrp = item.mrp_unit_price ?? item.variant?.mrp;
  if (mrp != null && Number(mrp) > 0) return Number(mrp);
  return Number(item.unit_price) || 0;
};

const lineSpecialTotal = (item) =>
  roundMoney((Number(item.unit_price) || 0) * (Number(item.quantity) || 0));

const calcMrpDiscount = (items) => {
  let total = 0;
  for (const item of items || []) {
    const mrp = lineMrp(item);
    const special = Number(item.unit_price) || 0;
    const qty = Number(item.quantity) || 0;
    total = roundMoney(total + Math.max(0, mrp - special) * qty);
  }
  return total;
};

const shopGstin = (bill) => bill.gst_config?.gst_number?.trim() || null;

/** State label — GST: "Haryana (06)"; non-GST: "Haryana" only. */
const formatStateLabel = (code, { withCode = true } = {}) => {
  const normalized = normalizeStateCode(code);
  if (!normalized) return '';
  const name = getStateName(normalized);
  return withCode ? `${name} (${normalized})` : name;
};

/** City + state — e.g. "Gurgaon, Haryana (06)" or "Gurgaon, Haryana". */
const formatCityStateLabel = (city, stateCode, { withCode = true } = {}) => {
  const cityPart = displayVal(city);
  const statePart = formatStateLabel(stateCode, { withCode });
  if (cityPart && statePart) return `${cityPart}, ${statePart}`;
  return cityPart || statePart;
};

const getTaxRatePercents = (items, taxMode) => {
  const taxedLine = (items || []).find((i) => i.tax_amount > 0 && Number(i.gst_percent) > 0);
  if (!taxedLine) return { cgstPercent: 0, sgstPercent: 0, igstPercent: 0, totalPercent: 0 };
  const rate = Number(taxedLine.gst_percent) || 0;
  if (taxMode === 'IGST') {
    return { cgstPercent: 0, sgstPercent: 0, igstPercent: rate, totalPercent: rate };
  }
  const half = roundMoney(rate / 2);
  return { cgstPercent: half, sgstPercent: roundMoney(rate - half), igstPercent: 0, totalPercent: rate };
};

const GRID_LINE = 0.5;

const strokeRect = (doc, x, y, w, h, color = '#333333') => {
  doc.save().lineWidth(GRID_LINE).strokeColor(color).rect(x, y, w, h).stroke().restore();
};

/** Single-pass table grid — avoids double-stroked shared cell edges. */
const strokeTableGrid = (doc, x, y, colWidths, headerH, rowH, dataRowCount) => {
  const totalW = colWidths.reduce((sum, w) => sum + w, 0);
  const totalH = headerH + dataRowCount * rowH;
  doc.save().lineWidth(GRID_LINE).strokeColor('#333333');
  doc.rect(x, y, totalW, totalH).stroke();
  doc.moveTo(x, y + headerH).lineTo(x + totalW, y + headerH).stroke();
  for (let r = 1; r < dataRowCount; r += 1) {
    const hy = y + headerH + r * rowH;
    doc.moveTo(x, hy).lineTo(x + totalW, hy).stroke();
  }
  let vx = x;
  for (let i = 0; i < colWidths.length - 1; i += 1) {
    vx += colWidths[i];
    doc.moveTo(vx, y).lineTo(vx, y + totalH).stroke();
  }
  doc.restore();
};

const cellText = (doc, text, x, y, w, h, { align = 'left', bold = false, size = 8, pad = 3 } = {}) => {
  const cellW = Math.max(1, safeDim(w, 1) - pad * 2);
  const cellH = Math.max(1, safeDim(h, 1) - pad * 2);
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(safeDim(size, FIELD_SIZE));
  doc.text(String(text ?? ''), safeDim(x) + pad, safeDim(y) + pad, { width: cellW, height: cellH, align });
};

const drawWatermark = (doc, text) => {
  doc.save().rotate(-35, { origin: [297, 420] });
  doc.fontSize(52).fillColor('#ccc').opacity(0.22).text(text, 80, 380, { width: 500, align: 'center' });
  doc.restore().fillColor('#000').opacity(1);
};

// ─── GST / Non-GST / Estimate — shared template with per-type sections ───────

const renderGstTaxInvoice = (doc, bill, { isNonGst = false, isEstimate = false } = {}) => {
  const shop = bill.shop || {};
  const items = bill.items || [];
  const gst = shopGstin(bill);
  const legalName = bill.gst_config?.legal_name?.trim() || shop.shop_name || '';
  const mrpDiscount = calcMrpDiscount(items);
  const gstSplit = buildTaxSummaryFromLines(items);
  const taxRates = getTaxRatePercents(items, gstSplit.tax_mode);
  const cust = bill.customer || {};
  // Dispatch = shop master city + state only (never derive state from GSTIN — avoids Delhi + Haryana mismatch).
  const shopDispatchCode = normalizeStateCode(shop.state_code);
  const customerSupplyCode = normalizeStateCode(cust.state_code);
  const showStateCode = !isNonGst;
  const posName = displayVal(
    formatCityStateLabel(cust.city, customerSupplyCode, { withCode: showStateCode })
  );
  const dispatchName = displayVal(
    formatCityStateLabel(shop.city, shopDispatchCode, { withCode: showStateCode })
  );
  // GST invoices always show shop bank details (cash / UPI / card / transfer) when configured
  const showBankDetails = !isNonGst && !isEstimate && Boolean(bill.bank_account);

  let y = M;

  // ── Top: GSTIN left (GST only) | Original / Duplicate / Triplicate right (GST only) ──
  if (!isNonGst) {
    drawLabelValue(doc, M, y, 'GSTIN', gst, HALF);
    doc.fontSize(7.5).font('Helvetica').text('Original / Duplicate / Triplicate', M, y, {
      width: W,
      align: 'right',
    });
    y += 16;
  } else {
    y += 4;
  }

  // ── Document title (GST only — fake/non-GST bills have no title) ──
  if (!isNonGst) {
    const gstTitleSize = 11;
    doc.fontSize(gstTitleSize).font('Helvetica-Bold');
    const gstTitle = 'GST INVOICE';
    const gstTitleW = doc.widthOfString(gstTitle);
    const gstTitleX = M + (W - gstTitleW) / 2;
    doc.text(gstTitle, gstTitleX, y, { lineBreak: false });
    drawManualUnderline(doc, gstTitleX, y, gstTitle, { size: gstTitleSize, offset: 12 });
    y += 18;
  }

  // ── Shop identity (fake bill: "Recipient" title only — same style as shop name) ──
  if (isEstimate) {
    doc.fontSize(16).font('Helvetica-Bold');
    doc.text('Receipt', M, y, { width: W, align: 'center' });
    y += 34;
  } else {
    doc.fontSize(16).font('Helvetica-Bold');
    doc.text(shop.shop_name || 'Shop', M, y, { width: W, align: 'center' });
    y += 18;
    drawCenteredSegments(doc, y, [
      { text: 'Shop ID : ', bold: true },
      { text: displayVal(shop.shop_code), bold: false },
      { text: '  |  Shop Name : ', bold: true },
      { text: displayVal(legalName), bold: false },
    ]);
    y += 12;
    const addrParts = [shop.address, shop.city, shop.pincode].filter(Boolean).join(', ');
    if (addrParts) {
      doc.fontSize(FIELD_SIZE).font('Helvetica').text(addrParts, M, y, { width: W, align: 'center' });
      y += 11;
    }
    drawCenteredSegments(doc, y, [
      { text: 'Phone : ', bold: true },
      { text: displayVal(shop.phone), bold: false },
      { text: '   |   Email : ', bold: true },
      { text: displayVal(shop.email), bold: false },
    ]);
    y += 12;
  }

  doc.moveTo(M, y).lineTo(R, y).strokeColor('#333').lineWidth(0.75).stroke();
  y += 4;

  // ── Bill To | Invoice Info (two-column bordered box) ──
  const infoH = 120;
  strokeRect(doc, M, y, W, infoH);
  doc.moveTo(MID, y).lineTo(MID, y + infoH).strokeColor('#333').lineWidth(0.6).stroke();

  const lx = M;
  const rx = MID;
  const colW = HALF;

  const billToX = lx + 6;
  const billToY = y + 5;
  doc.fontSize(FIELD_SIZE).font('Helvetica-Bold');
  const billToText = 'Bill To';
  doc.text(billToText, billToX, billToY, { lineBreak: false });
  drawManualUnderline(doc, billToX, billToY, billToText);
  doc.text(' :', billToX + doc.widthOfString(billToText), billToY, { lineBreak: false });
  let ly = y + 19;
  drawLabelValue(doc, lx + 6, ly, 'M/S', displayVal(bill.customer_name) || 'Walk-in Customer', colW - 12);
  ly += 11;
  if (cust.address) {
    doc.font('Helvetica').fontSize(FIELD_SIZE);
    doc.text(cust.address, lx + 6, ly, { width: colW - 12 });
    ly += 11;
  }
  const custCity = [cust.city, getStateName(cust.state_code), cust.pincode]
    .filter(Boolean)
    .join(', ');
  if (custCity) {
    doc.font('Helvetica').fontSize(FIELD_SIZE);
    doc.text(custCity, lx + 6, ly, { width: colW - 12 });
    ly += 11;
  }
  drawLabelValue(doc, lx + 6, ly, 'Mobile', bill.customer_mobile, colW - 12);
  ly += 11;
  if (!isNonGst) {
    drawLabelValue(doc, lx + 6, ly, 'GSTIN', bill.customer_gstin, colW - 12);
    ly += 11;
    const stateCode = cust.state_code || bill.place_of_supply_state_code;
    let custState = '';
    if (stateCode) {
      const code = String(stateCode).trim().padStart(2, '0').slice(-2);
      const name = getStateName(code);
      custState = `${name} (${code})`;
    }
    drawLabelValue(doc, lx + 6, ly, 'State', displayVal(custState), colW - 12);
  }

  const rxPad = rx + 6;
  const rxW = colW - 12;
  let ry = y + 14;
  drawLabelValue(doc, rxPad, ry, 'Invoice No', bill.bill_number, rxW);
  ry += 11;
  drawLabelValue(doc, rxPad, ry, 'Date', fmtDate(bill.created_at), rxW);
  ry += 11;
  drawLabelValue(doc, rxPad, ry, 'E-Way Bill No', '', rxW);
  ry += 11;
  drawLabelValue(doc, rxPad, ry, 'Place of Supply', posName, rxW);
  ry += 11;
  drawLabelValue(doc, rxPad, ry, 'Place of Dispatch', dispatchName, rxW);
  ry += 11;
  drawLabelValue(doc, rxPad, ry, 'Transport', '', rxW);
  ry += 11;

  const payFontSize = 9;
  const payBoxH = 20;
  const payBoxY = ry + 6;
  strokeRect(doc, rx + 6, payBoxY, colW - 12, payBoxH);
  drawLabelValue(
    doc,
    rx + 10,
    payBoxY + 6,
    'Mode of Payment',
    bill.payment_method || '',
    colW - 20,
    payFontSize,
  );

  y += infoH;

  // ── Product table (full grid borders) ──
  const cols = isNonGst
    ? [
        { label: 'S.No.', w: 28 },
        { label: 'Product Name', w: 216 },
        { label: 'Qty', w: 32 },
        { label: 'MRP', w: 68 },
        { label: 'Special Price', w: 76 },
        { label: 'Total', w: W - 28 - 216 - 32 - 68 - 76 },
      ]
    : [
        { label: 'S.No.', w: 28 },
        { label: 'Product Name', w: 168 },
        { label: 'HSN Code', w: 48 },
        { label: 'Qty', w: 32 },
        { label: 'MRP', w: 68 },
        { label: 'Special Price', w: 76 },
        { label: 'Total', w: W - 28 - 168 - 48 - 32 - 68 - 76 },
      ];
  const rowH = 15;
  const headerH = 16;
  const colWidths = cols.map((c) => c.w);

  const drawTableHeader = (tableY) => {
    let cx = M;
    for (const col of cols) {
      cellText(doc, col.label, cx, tableY, col.w, headerH, { align: 'center', bold: true, size: 7.5 });
      cx += col.w;
    }
  };

  const drawTableRows = (tableY, tableItems) => {
    let rowY = tableY + headerH;
    tableItems.forEach((item, idx) => {
      const name = item.variant?.product?.name || item.product?.name || item.variant?.sku || 'Item';
      const row = isNonGst
        ? [
            String(idx + 1),
            name,
            String(item.quantity),
            fmtNum(lineMrp(item)),
            fmtNum(item.unit_price),
            fmtNum(lineSpecialTotal(item)),
          ]
        : [
            String(idx + 1),
            name,
            displayVal(item.hsn_code),
            String(item.quantity),
            fmtNum(lineMrp(item)),
            fmtNum(item.unit_price),
            fmtNum(lineSpecialTotal(item)),
          ];
      let cx = M;
      cols.forEach((col, i) => {
        cellText(doc, row[i], cx, rowY, col.w, rowH, { align: 'center', bold: false, size: 7.5 });
        cx += col.w;
      });
      rowY += rowH;
    });
    return rowY;
  };

  const tableStartY = y;
  const itemsPerPage = Math.max(1, Math.floor((620 - tableStartY - headerH) / rowH));
  let itemIdx = 0;

  if (!items.length) {
    strokeTableGrid(doc, M, y, colWidths, headerH, rowH, 0);
    drawTableHeader(y);
    y += headerH;
  }

  while (itemIdx < items.length) {
    const chunk = items.slice(itemIdx, itemIdx + itemsPerPage);
    const pageTableY = itemIdx === 0 ? tableStartY : M;
    strokeTableGrid(doc, M, pageTableY, colWidths, headerH, rowH, chunk.length);
    drawTableHeader(pageTableY);
    const afterRowsY = drawTableRows(pageTableY, chunk);
    y = afterRowsY;
    itemIdx += chunk.length;
    if (itemIdx < items.length) {
      doc.addPage();
    }
  }

  // ── Bank Details (left) | Totals (right) ──
  const finH = isNonGst ? 68 : 118;
  strokeRect(doc, M, y, W, finH);
  if (showBankDetails) {
    doc.save().lineWidth(GRID_LINE).strokeColor('#333333');
    doc.moveTo(MID, y).lineTo(MID, y + finH).stroke();
    doc.restore();
  }

  const bankX = M + 4;
  if (showBankDetails) {
    const bank = bill.bank_account;
    let by = y + 12;
    doc.fontSize(FIELD_SIZE).font('Helvetica-Bold');
    const bankTitle = 'Bank Details';
    doc.text(bankTitle, bankX, by, { lineBreak: false });
    drawManualUnderline(doc, bankX, by, bankTitle);
    by += 14;
    const bankRows = [
      ['Account Holder Name', displayVal(bank.account_holder_name)],
      ['Bank Name', displayVal(bank.bank_name)],
      ['Account No.', bank.account_number ? maskAccountNumber(bank.account_number) : ''],
      ['IFSC Code', displayVal(bank.ifsc_code)],
      ['Branch', displayVal(bank.branch_name)],
    ];
    if (bank.upi_id) {
      bankRows.push(['UPI ID', displayVal(bank.upi_id)]);
    }
    for (const [lbl, val] of bankRows) {
      drawLabelValue(doc, bankX, by, lbl, val, HALF - 12);
      by += ROW_STEP;
    }
  }

  // Totals — always right column (vertical divider only when bank details shown)
  const tx = MID + 8;
  const tw = HALF - 16;
  let ty = y + 8;

  const drawTotalLine = (label, value, { labelSize = 8, valueSize = 8 } = {}) => {
    doc.font('Helvetica-Bold').fontSize(labelSize);
    doc.text(label, tx, ty, { width: 130, align: 'left' });
    doc.font('Helvetica').fontSize(valueSize);
    doc.text(value, tx + 130, ty, { width: tw - 130, align: 'right' });
    ty += ROW_STEP;
  };

  const drawGstAddLine = (taxPart, value) => {
    doc.font('Helvetica-Bold').fontSize(FIELD_SIZE);
    const addText = 'Add';
    doc.text(addText, tx, ty, { lineBreak: false });
    drawManualUnderline(doc, tx, ty, addText);
    const addW = doc.widthOfString(addText);
    doc.text(` : ${taxPart}`, tx + addW, ty, { lineBreak: false });
    doc.font('Helvetica').fontSize(FIELD_SIZE);
    doc.text(value, tx + 130, ty, { width: tw - 130, align: 'right' });
    ty += ROW_STEP;
  };

  drawTotalLine('Sub Total', fmtNum(bill.subtotal));
  drawTotalLine('Discount', `- ${fmtNum(mrpDiscount)}`);

  if (!isNonGst) {
    drawTotalLine('Total Amount', fmtNum(bill.taxable_amount));

    if (gstSplit.tax_mode === 'CGST_SGST') {
      if (gstSplit.cgst > 0) {
        drawGstAddLine(`CGST (${taxRates.cgstPercent}%)`, `+ ${fmtNum(gstSplit.cgst)}`);
      }
      if (gstSplit.sgst > 0) {
        drawGstAddLine(`SGST (${taxRates.sgstPercent}%)`, `+ ${fmtNum(gstSplit.sgst)}`);
      }
    } else if (gstSplit.igst > 0) {
      drawGstAddLine(`IGST (${taxRates.igstPercent}%)`, `+ ${fmtNum(gstSplit.igst)}`);
    }

    if (bill.gst_amount > 0) {
      drawTotalLine(`Total Tax Amount (${taxRates.totalPercent}%)`, fmtNum(bill.gst_amount));
      ty += 2;
    }
  }

  doc.moveTo(tx, ty).lineTo(tx + tw, ty).stroke();
  ty += 8;
  doc.font('Helvetica-Bold').fontSize(11);
  doc.text('Total Payable Amount', tx, ty, { width: 150, align: 'left' });
  doc.font('Helvetica').fontSize(11);
  doc.text(fmtMoney(bill.total_amount), tx + 150, ty, { width: tw - 150, align: 'right' });

  y += finH;

  // ── Amount in words ──
  const wordsPadTop = 6;
  const wordsH = 32;
  strokeRect(doc, M, y, W, wordsH);
  doc.fontSize(8).font('Helvetica-Bold').text('Total Amount (in words) :', M + 6, y + wordsPadTop);
  doc.font('Helvetica').fontSize(8);
  doc.text(amountInWords(bill.total_amount), M + 6, y + wordsPadTop + SECTION_LABEL_GAP, {
    width: W - 12,
    lineGap: 1,
  });
  y += wordsH;

  if (!isEstimate) {
    // ── Declaration ──
    const declPadTop = 6;
    const declH = 40;
    strokeRect(doc, M, y, W, declH);
    doc.fontSize(8).font('Helvetica-Bold').text('Declaration :', M + 6, y + declPadTop);
    doc.font('Helvetica').fontSize(7);
    doc.text(
      'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
      M + 6,
      y + declPadTop + SECTION_LABEL_GAP,
      { width: W - 12, lineGap: 1 }
    );
    y += declH;

    // ── Terms | Authorised signatory ──
    const footH = 72;
    strokeRect(doc, M, y, W, footH);
    doc.moveTo(MID, y).lineTo(MID, y + footH).stroke();

    const footPadTop = 6;
    if (isNonGst) {
      doc.fontSize(7.5).font('Helvetica-Bold').text('Note:', M + 6, y + footPadTop);
      doc.font('Helvetica').fontSize(7);
      doc.text('1. Keep the bill for warranty or guarantee purpose.', M + 6, y + footPadTop + NOTE_LABEL_GAP, {
        width: HALF - 12,
        lineGap: 1,
      });
    } else {
      doc.fontSize(7.5).font('Helvetica-Bold').text('Terms & Conditions :', M + 6, y + footPadTop);
      doc.font('Helvetica').fontSize(7);
      const terms = [
        '1. E. & O.E.',
        '2. Subject to local jurisdiction only.',
        '3. Keep the bill for warranty or guarantee purpose.',
      ];
      let tcy = y + footPadTop + SECTION_LABEL_GAP;
      for (const t of terms) {
        doc.text(t, M + 6, tcy, { width: HALF - 12, lineGap: 1 });
        tcy += ROW_STEP;
      }
    }

    doc.fontSize(8).font('Helvetica-Bold').text(`For ${shop.shop_name || 'Shop'}`, rx + 6, y + 6);
    const stampX = rx + colW - 62;
    const stampY = y + 18;
    doc.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#999');
    doc.rect(stampX, stampY, 48, 36).stroke();
    doc.undash().restore();
    doc.fontSize(6.5).font('Helvetica').fillColor('#888');
    doc.text('Shop Seal / Stamp', stampX, stampY + 14, { width: 48, align: 'center' });
    doc.fillColor('#000');
    doc.moveTo(rx + 6, y + footH - 14).lineTo(R - 8, y + footH - 14).stroke();
    doc.fontSize(7).font('Helvetica-Oblique').text('Authorised Signatory', rx + 6, y + footH - 12);

    y += footH + 8;
  } else {
    y += 8;
  }
  doc.fontSize(7).font('Helvetica-Oblique').fillColor('#666');
  doc.text('This is a computer generated invoice.', M, y, { width: W, align: 'center' });
  doc.fillColor('#000').font('Helvetica');
};

const ensureCloudinary = () => {
  const cloudName = trimEnv(config.CLOUDINARY_CLOUD_NAME);
  const apiKey = trimEnv(config.CLOUDINARY_API_KEY);
  const apiSecret = trimEnv(config.CLOUDINARY_API_SECRET);
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError('Cloudinary is not configured for PDF upload', 503, 'CLOUDINARY_MISCONFIGURED');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
};

const buildBillPdfBuffer = (bill) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: M, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (bill.bill_type === 'GST_INVOICE') {
        renderGstTaxInvoice(doc, bill);
      } else if (bill.bill_type === 'NON_GST_INVOICE') {
        renderGstTaxInvoice(doc, bill, { isNonGst: true });
      } else if (bill.bill_type === 'ESTIMATE_INVOICE') {
        renderGstTaxInvoice(doc, bill, { isNonGst: true, isEstimate: true });
      } else {
        renderGstTaxInvoice(doc, bill, { isNonGst: true });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });

const uploadBillPdf = async (buffer, billNumber) => {
  ensureCloudinary();
  const folder = `${trimEnv(config.CLOUDINARY_FOLDER) || 'vyaapar'}/invoices`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'raw',
        format: 'pdf',
        public_id: billNumber.replace(/[^a-zA-Z0-9-_]/g, '_'),
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ pdf_storage_key: result.public_id, pdf_url: result.secure_url });
      }
    );
    stream.end(buffer);
  });
};

const generateBillPdf = async (bill, { persist = true } = {}) => {
  const buffer = await buildBillPdfBuffer(bill);
  if (!persist) return { buffer, contentType: 'application/pdf' };
};

module.exports = { buildBillPdfBuffer, generateBillPdf };
