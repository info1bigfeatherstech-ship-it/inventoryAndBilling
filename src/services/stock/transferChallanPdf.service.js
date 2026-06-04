const PDFDocument = require('pdfkit');
const { AppError } = require('../../errors/AppError');

const fmtMoney = (n) => `₹${Number(n || 0).toFixed(2)}`;

const REQUEST_TYPE_LABELS = {
  WH_TO_SHOP: 'Warehouse → Shop',
  WH_TO_WH: 'Warehouse → Warehouse',
  SHOP_TO_SHOP: 'Shop → Shop',
};

/**
 * @param {object} doc - Challan payload from TransferChallanService
 */
const buildTransferChallanPdfBuffer = (doc) =>
  new Promise((resolve, reject) => {
    try {
      const pdf = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks = [];
      pdf.on('data', (c) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      pdf.fontSize(16).text('STOCK TRANSFER CHALLAN', { align: 'center', underline: true });
      pdf.moveDown(0.3);
      pdf.fontSize(9).text('Internal movement — not a tax invoice (no GST)', { align: 'center' });
      pdf.moveDown(0.8);

      pdf.fontSize(10);
      pdf.text(`Challan No: ${doc.document_number}`);
      pdf.text(`Type: ${REQUEST_TYPE_LABELS[doc.request_type] || doc.request_type}`);
      pdf.text(`Status: ${doc.status?.replace(/_/g, ' ') || '-'}`);
      pdf.text(`Date: ${new Date(doc.document_date).toLocaleDateString('en-IN')}`);
      if (doc.tracking_number) pdf.text(`Tracking / LR: ${doc.tracking_number}`);
      pdf.moveDown(0.5);

      pdf.font('Helvetica-Bold').text('From');
      pdf.font('Helvetica').text(doc.from_label || '-');
      if (doc.from_address) pdf.text(doc.from_address);
      pdf.moveDown(0.4);

      pdf.font('Helvetica-Bold').text('To');
      pdf.font('Helvetica').text(doc.to_label || '-');
      if (doc.to_address) pdf.text(doc.to_address);
      pdf.moveDown(0.8);

      const tableTop = pdf.y;
      pdf.fontSize(8).font('Helvetica-Bold');
      let x = 40;
      pdf.text('#', x, tableTop, { width: 20 });
      x += 22;
      pdf.text('Product / SKU', x, tableTop, { width: 150 });
      x += 152;
      pdf.text('HSN', x, tableTop, { width: 40 });
      x += 42;
      pdf.text('Batch', x, tableTop, { width: 50 });
      x += 52;
      pdf.text('Qty', x, tableTop, { width: 32 });
      x += 34;
      pdf.text('Unit Cost', x, tableTop, { width: 52 });
      x += 54;
      pdf.text('Value', x, tableTop, { width: 52 });

      pdf.font('Helvetica');
      let y = tableTop + 14;
      let totalQty = 0;
      let totalValue = 0;

      (doc.lines || []).forEach((line, idx) => {
        if (y > 700) {
          pdf.addPage();
          y = 50;
        }
        x = 40;
        pdf.text(String(idx + 1), x, y, { width: 20 });
        x += 22;
        pdf.text(`${line.product_name || '-'} / ${line.sku || '-'}`, x, y, { width: 150 });
        x += 152;
        pdf.text(line.hsn_code || '-', x, y, { width: 40 });
        x += 42;
        pdf.text(line.batch_number || '-', x, y, { width: 50 });
        x += 52;
        pdf.text(String(line.quantity), x, y, { width: 32 });
        x += 34;
        pdf.text(line.unit_cost != null ? fmtMoney(line.unit_cost) : '-', x, y, { width: 52 });
        x += 54;
        const lineVal = line.line_value != null ? line.line_value : 0;
        pdf.text(line.line_value != null ? fmtMoney(lineVal) : '-', x, y, { width: 52 });
        totalQty += Number(line.quantity) || 0;
        totalValue += lineVal;
        y += 14;
      });

      pdf.moveDown(2);
      pdf.font('Helvetica-Bold');
      pdf.text(`Total Quantity: ${totalQty}`, 40, y + 8);
      if (totalValue > 0) {
        pdf.text(`Total Transfer Value (at cost): ${fmtMoney(totalValue)}`, 40, y + 22);
      }

      pdf.moveDown(3);
      pdf.fontSize(8).font('Helvetica');
      pdf.text('Dispatched by: ___________________', 40);
      pdf.text('Received by: ___________________', 300);
      pdf.text('Date: ___________________', 40, pdf.y + 20);

      if (doc.remarks) {
        pdf.moveDown(1);
        pdf.text(`Remarks: ${doc.remarks}`, { width: 500 });
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
