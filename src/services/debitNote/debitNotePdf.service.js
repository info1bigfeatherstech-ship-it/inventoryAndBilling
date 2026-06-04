const PDFDocument = require('pdfkit');
const { AppError } = require('../../errors/AppError');

const fmtMoney = (n) => `₹${Number(n || 0).toFixed(2)}`;

const TYPE_LABELS = {
  SHORTAGE: 'Shortage in supply',
  DEFECTIVE: 'Defective goods return',
  RATE_DIFFERENCE: 'Rate / billing difference',
  OTHER: 'Other',
};

const buildDebitNotePdfBuffer = (debitNote) =>
  new Promise((resolve, reject) => {
    try {
      const pdf = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks = [];
      pdf.on('data', (c) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      pdf.fontSize(16).text('DEBIT NOTE', { align: 'center', underline: true });
      pdf.moveDown(0.3);
      pdf.fontSize(9).text('(Purchase return / claim against vendor)', { align: 'center' });
      pdf.moveDown(0.8);

      pdf.fontSize(10);
      pdf.text(`Debit Note No: ${debitNote.debit_note_number}`);
      pdf.text(`Type: ${TYPE_LABELS[debitNote.type] || debitNote.type}`);
      pdf.text(`Status: ${debitNote.status}`);
      pdf.text(`Date: ${new Date(debitNote.created_at).toLocaleDateString('en-IN')}`);
      pdf.moveDown(0.5);
      pdf.text(`Vendor: ${debitNote.vendor?.company_name || '-'}`);
      if (debitNote.vendor?.gst_number) pdf.text(`Vendor GSTIN: ${debitNote.vendor.gst_number}`);
      pdf.text(`Warehouse: ${debitNote.warehouse?.warehouse_name || '-'}`);
      pdf.text(`Against Purchase: ${debitNote.original_purchase?.purchase_number || '-'}`);
      pdf.text(`Vendor Invoice: ${debitNote.original_purchase?.vendor_invoice_no || '-'}`);
      if (debitNote.return_stock) pdf.text('Stock: Returned to vendor (qty deducted from WH)');
      pdf.moveDown(0.8);

      const tableTop = pdf.y;
      pdf.fontSize(8).font('Helvetica-Bold');
      let x = 40;
      pdf.text('#', x, tableTop, { width: 18 });
      x += 20;
      pdf.text('Product / SKU', x, tableTop, { width: 130 });
      x += 132;
      pdf.text('Qty', x, tableTop, { width: 28 });
      x += 30;
      pdf.text('Rate', x, tableTop, { width: 40 });
      x += 42;
      pdf.text('Taxable', x, tableTop, { width: 46 });
      x += 48;
      pdf.text('Tax', x, tableTop, { width: 40 });
      x += 42;
      pdf.text('Total', x, tableTop, { width: 44 });

      pdf.font('Helvetica');
      let y = tableTop + 14;
      (debitNote.lines || []).forEach((line, idx) => {
        const name = line.variant?.product?.name || line.product_id;
        const sku = line.variant?.sku || '';
        x = 40;
        pdf.text(String(idx + 1), x, y, { width: 18 });
        x += 20;
        pdf.text(`${name} (${sku})`, x, y, { width: 130 });
        x += 132;
        pdf.text(String(line.quantity), x, y, { width: 28 });
        x += 30;
        pdf.text(fmtMoney(line.unit_cost), x, y, { width: 40 });
        x += 42;
        pdf.text(fmtMoney(line.line_subtotal), x, y, { width: 46 });
        x += 48;
        pdf.text(fmtMoney(line.tax_amount), x, y, { width: 40 });
        x += 42;
        pdf.text(fmtMoney(line.line_total), x, y, { width: 44 });
        y += 14;
      });

      pdf.moveDown(2);
      pdf.fontSize(10).font('Helvetica-Bold');
      pdf.text(`Subtotal (taxable): ${fmtMoney(debitNote.subtotal)}`, 300, y + 10, { align: 'right', width: 255 });
      pdf.text(`Tax Amount: ${fmtMoney(debitNote.gst_amount)}`, 300, y + 26, { align: 'right', width: 255 });
      pdf.text(`Debit Amount: ${fmtMoney(debitNote.debit_amount)}`, 300, y + 42, { align: 'right', width: 255 });

      if (debitNote.remarks) {
        pdf.moveDown(2);
        pdf.font('Helvetica').fontSize(9);
        pdf.text(`Remarks: ${debitNote.remarks}`, { width: 500 });
      }

      pdf.end();
    } catch (err) {
      reject(err);
    }
  });

const generateDebitNotePdf = async (debitNote) => {
  if (!debitNote) throw new AppError('Debit note not found', 404, 'DEBIT_NOTE_NOT_FOUND');
  const buffer = await buildDebitNotePdfBuffer(debitNote);
  return {
    buffer,
    filename: `${debitNote.debit_note_number}.pdf`,
    contentType: 'application/pdf',
  };
};

module.exports = { generateDebitNotePdf, buildDebitNotePdfBuffer };
