const { roundMoney } = require('./billing.utils');
const { amountInWords } = require('./amountInWords.utils');
const { parseAttributes } = require('./variantAttributes.utils');

const M = 36;
const R = 559;
const W = R - M;
const MID = M + W / 2;
const HALF = W / 2;

const FIELD_SIZE = 8;
const ROW_STEP = 13;
const SECTION_LABEL_GAP = 12;
const NOTE_LABEL_GAP = 14;
const GRID_LINE = 0.5;

const safeNum = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

const safeDim = (n, fallback = 0) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
};

const fmtNum = (n) =>
  safeNum(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtMoney = (n) => `Rs. ${fmtNum(n)}`;

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN');

const displayVal = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s;
};

const truncateProductName = (value, max = 25) => {
  const text = displayVal(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

const drawManualUnderline = (doc, x, y, text, { size = FIELD_SIZE, offset = 9 } = {}) => {
  const w = doc.widthOfString(text);
  doc.save().strokeColor('#000').lineWidth(0.5);
  doc.moveTo(x, y + offset).lineTo(x + w, y + offset).stroke();
  doc.restore();
};

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

const strokeRect = (doc, x, y, w, h, color = '#333333') => {
  doc.save().lineWidth(GRID_LINE).strokeColor(color).rect(x, y, w, h).stroke().restore();
};

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

/** Stack header lines — each line drawn whole (no mid-word break), horizontally centered. */
const drawStackedHeader = (doc, x, y, w, h, lines, { size = 7.5 } = {}) => {
  doc.font('Helvetica-Bold').fontSize(size);
  const lineH = size + 2;
  const blockH = lines.length * lineH;
  let cy = y + Math.max(2, (h - blockH) / 2);
  for (const line of lines) {
    const tw = doc.widthOfString(line);
    const tx = x + Math.max(0, (w - tw) / 2);
    doc.text(line, tx, cy, { lineBreak: false });
    cy += lineH;
  }
};

/** Single-line cell text — never breaks a word; shrinks font slightly if needed. */
const drawFitCellText = (doc, text, x, y, w, h, { align = 'center', bold = false, size = 7.5, pad = 3 } = {}) => {
  const str = String(text ?? '');
  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);
  let fontSize = size;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
  while (fontSize >= 6) {
    doc.fontSize(fontSize);
    if (doc.widthOfString(str) <= innerW) break;
    fontSize -= 0.5;
  }
  const textW = doc.widthOfString(str);
  const textH = fontSize;
  let tx = x + pad;
  if (align === 'center') tx = x + pad + Math.max(0, (innerW - textW) / 2);
  else if (align === 'right') tx = x + w - pad - textW;
  const ty = y + pad + Math.max(0, (innerH - textH) / 2);
  doc.text(str, tx, ty, { lineBreak: false });
};

const drawTableHeaderLabel = (doc, x, y, w, h, col, { size = 7.5 } = {}) => {
  if (col.labelLines?.length) {
    drawStackedHeader(doc, x, y, w, h, col.labelLines, { size });
    return;
  }
  drawFitCellText(doc, col.label, x, y, w, h, { align: 'center', bold: true, size });
};

const drawProductCellAttributes = (doc, x, y, colW, attributes) => {
  const parts = parseAttributes(attributes) || [];
  if (!parts.length) return;

  const pad = 3;
  const textX = x + pad;
  doc.fontSize(6.4);
  let cursorX = textX;

  parts.forEach((attr, i) => {
    if (i > 0) {
      doc.font('Helvetica').text(', ', cursorX, y, { lineBreak: false });
      cursorX += doc.widthOfString(', ');
    }
    doc.font('Helvetica-Bold').text(`${attr.key}: `, cursorX, y, { lineBreak: false });
    cursorX += doc.widthOfString(`${attr.key}: `);
    doc.font('Helvetica').text(attr.value, cursorX, y, { lineBreak: false });
    cursorX += doc.widthOfString(attr.value);
  });
};

const drawGstAddLine = (doc, tx, ty, tw, taxPart, value) => {
  doc.font('Helvetica-Bold').fontSize(FIELD_SIZE);
  const addText = 'Add';
  doc.text(addText, tx, ty, { lineBreak: false });
  drawManualUnderline(doc, tx, ty, addText);
  const addW = doc.widthOfString(addText);
  doc.text(` : ${taxPart}`, tx + addW, ty, { lineBreak: false });
  doc.font('Helvetica').fontSize(FIELD_SIZE);
  doc.text(value, tx + 130, ty, { width: tw - 130, align: 'right' });
  return ty + ROW_STEP;
};

const drawTotalLine = (doc, tx, ty, tw, label, value, { labelSize = 8, valueSize = 8 } = {}) => {
  doc.font('Helvetica-Bold').fontSize(labelSize);
  doc.text(label, tx, ty, { width: 130, align: 'left' });
  doc.font('Helvetica').fontSize(valueSize);
  doc.text(value, tx + 130, ty, { width: tw - 130, align: 'right' });
  return ty + ROW_STEP;
};

const drawTransferFooter = (doc, y, issuerName, { totalAmount } = {}) => {
  const wordsPadTop = 6;
  const wordsH = 32;
  strokeRect(doc, M, y, W, wordsH);
  doc.fontSize(8).font('Helvetica-Bold').text('Total Amount (in words) :', M + 6, y + wordsPadTop);
  doc.font('Helvetica').fontSize(8);
  doc.text(amountInWords(totalAmount), M + 6, y + wordsPadTop + SECTION_LABEL_GAP, {
    width: W - 12,
    lineGap: 1,
  });
  y += wordsH;

  const footH = 72;
  strokeRect(doc, M, y, W, footH);
  doc.moveTo(MID, y).lineTo(MID, y + footH).stroke();

  const rx = MID;
  const colW = HALF;
  doc.fontSize(8).font('Helvetica-Bold').text(`For ${issuerName || 'Warehouse'}`, rx + 6, y + 6);
  const stampX = rx + colW - 62;
  const stampY = y + 18;
  doc.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#999');
  doc.rect(stampX, stampY, 48, 36).stroke();
  doc.undash().restore();
  doc.fontSize(6.5).font('Helvetica').fillColor('#888');
  doc.text('Seal / Stamp', stampX, stampY + 14, { width: 48, align: 'center' });
  doc.fillColor('#000');
  doc.moveTo(rx + 6, y + footH - 14).lineTo(R - 8, y + footH - 14).stroke();
  doc.fontSize(7).font('Helvetica-Oblique').text('Authorised Signatory', rx + 6, y + footH - 12);

  doc.fontSize(8).font('Helvetica');
  doc.text('Dispatched by: ___________________', M + 6, y + 28);
  doc.text('Received by: ___________________', M + 6, y + 48);

  y += footH + 8;
  doc.fontSize(7).font('Helvetica-Oblique').fillColor('#666');
  doc.text('This is a computer generated document.', M, y, { width: W, align: 'center' });
  doc.fillColor('#000').font('Helvetica');
  return y;
};

const drawTransferHeader = (doc, docPayload) => {
  const issuer = docPayload.issuer || {};
  const recipient = docPayload.recipient || {};
  let y = M + 4;

  if (docPayload.transfer_bill_type === 'GST_INVOICE' && issuer.gstin) {
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text(`GSTIN : ${issuer.gstin}`, M, y, { width: W, align: 'left' });
    y += 14;
  }

  doc.fontSize(16).font('Helvetica-Bold');
  doc.text(issuer.name || docPayload.from_label || 'Warehouse', M, y, { width: W, align: 'center' });
  y += 18;
  drawCenteredSegments(doc, y, [
    { text: 'Location ID : ', bold: true },
    { text: displayVal(issuer.code), bold: false },
    { text: '  |  Name : ', bold: true },
    { text: displayVal(issuer.name), bold: false },
  ]);
  y += 12;
  const addrParts = [issuer.address, issuer.city].filter(Boolean).join(', ');
  if (addrParts) {
    doc.fontSize(FIELD_SIZE).font('Helvetica').text(addrParts, M, y, { width: W, align: 'center' });
    y += 11;
  }
  if (issuer.manager_name) {
    doc.fontSize(FIELD_SIZE).font('Helvetica').text(`Manager : ${issuer.manager_name}`, M, y, {
      width: W,
      align: 'center',
    });
    y += 12;
  }

  doc.moveTo(M, y).lineTo(R, y).strokeColor('#333').lineWidth(0.75).stroke();
  y += 4;

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
  doc.fontSize(FIELD_SIZE).font('Helvetica');
  doc.text(displayVal(recipient.name || docPayload.to_label), lx + 6, ly, { width: colW - 12 });
  ly += 11;
  if (recipient.address) {
    doc.text(recipient.address, lx + 6, ly, { width: colW - 12 });
    ly += 11;
  }
  const recipientCity = [recipient.city, recipient.pincode].filter(Boolean).join(', ');
  if (recipientCity) {
    doc.text(recipientCity, lx + 6, ly, { width: colW - 12 });
    ly += 11;
  }
  drawLabelValue(doc, lx + 6, ly, 'Mobile', recipient.phone, colW - 12);

  const rxPad = rx + 6;
  const rxW = colW - 12;
  let ry = y + 14;
  drawLabelValue(doc, rxPad, ry, 'Challan No', docPayload.document_number, rxW);
  ry += 11;
  if (docPayload.transfer_bill_type) {
    const billTypeLabel =
      docPayload.transfer_bill_type === 'GST_INVOICE'
        ? 'GST Invoice'
        : docPayload.transfer_bill_type === 'ESTIMATE_INVOICE'
          ? 'Receipt'
          : 'Non-GST Invoice';
    drawLabelValue(doc, rxPad, ry, 'Bill Type', billTypeLabel, rxW);
    ry += 11;
  }
  drawLabelValue(doc, rxPad, ry, 'Date', fmtDate(docPayload.document_date), rxW);
  ry += 11;
  drawLabelValue(doc, rxPad, ry, 'Transfer Type', docPayload.request_type_label || docPayload.request_type, rxW);
  ry += 11;
  drawLabelValue(doc, rxPad, ry, 'Tracking / LR', docPayload.tracking_number, rxW);
  ry += 11;
  drawLabelValue(doc, rxPad, ry, 'Status', (docPayload.status || '').replace(/_/g, ' '), rxW);
  ry += 11;

  const payFontSize = 9;
  const payBoxH = 20;
  const payBoxY = ry + 6;
  strokeRect(doc, rx + 6, payBoxY, colW - 12, payBoxH);
  drawLabelValue(doc, rx + 10, payBoxY + 6, 'Mode', 'Stock Transfer', colW - 20, payFontSize);

  return y + infoH;
};

const drawPaginatedTable = (doc, startY, cols, lines, renderRow, { productWithSku = false } = {}) => {
  const rowH = 38;
  const headerH = 16;
  const colWidths = cols.map((c) => c.w);
  const productColIndex = cols.findIndex((c) => c.isProduct);

  const drawTableHeader = (tableY) => {
    let cx = M;
    for (const col of cols) {
      cellText(doc, col.label, cx, tableY, col.w, headerH, { align: 'center', bold: true, size: 7.5 });
      cx += col.w;
    }
  };

  let itemIdx = 0;
  let y = startY;
  const itemsPerPage = Math.max(1, Math.floor((620 - startY - headerH) / rowH));

  if (!lines.length) {
    strokeTableGrid(doc, M, y, colWidths, headerH, rowH, 0);
    drawTableHeader(y);
    return y + headerH;
  }

  while (itemIdx < lines.length) {
    const chunk = lines.slice(itemIdx, itemIdx + itemsPerPage);
    const pageTableY = itemIdx === 0 ? startY : M;
    strokeTableGrid(doc, M, pageTableY, colWidths, headerH, rowH, chunk.length);
    drawTableHeader(pageTableY);
    let rowY = pageTableY + headerH;
    chunk.forEach((line, idx) => {
      const globalIdx = itemIdx + idx;
      const row = renderRow(line, globalIdx);
      let cx = M;
      cols.forEach((col, i) => {
        if (i === productColIndex) {
          const productText = productWithSku
            ? truncateProductName(
                [row.productName, row.productSku].filter(Boolean).join(' / '),
                40
              )
            : truncateProductName(row.productName);
          doc.font('Helvetica').fontSize(7.5);
          doc.text(productText, cx + 3, rowY + 3, {
            width: Math.max(1, col.w - 6),
            height: rowH - 6,
            align: 'left',
            lineGap: 1,
          });
        } else {
          cellText(doc, row.cells[i], cx, rowY, col.w, rowH, { align: 'center', bold: false, size: 7.5 });
        }
        cx += col.w;
      });
      rowY += rowH;
    });
    y = rowY;
    itemIdx += chunk.length;
    if (itemIdx < lines.length) doc.addPage();
  }
  return y;
};

module.exports = {
  M,
  R,
  W,
  MID,
  HALF,
  FIELD_SIZE,
  ROW_STEP,
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
  drawTransferHeader,
  drawTransferFooter,
  drawPaginatedTable,
  drawTotalLine,
  drawGstAddLine,
  drawProductCellAttributes,
  SECTION_LABEL_GAP,
  NOTE_LABEL_GAP,
  roundMoney,
};
