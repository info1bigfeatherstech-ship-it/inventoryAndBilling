const PDFDocument = require('pdfkit');
const { AppError } = require('../../errors/AppError');
const fmtMoney = (n) => `₹${Number(n || 0).toFixed(2)}`;

/**
 * @param {object} purchase - Purchase with vendor, warehouse, items
 */
const buildPurchaseEntryPdfBuffer = (purchase) =>
  new Promise((resolve, reject) => {
    try {
      const pdf = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks = [];
      pdf.on('data', (c) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      pdf.fontSize(16).text('PURCHASE / GRN REGISTER', { align: 'center', underline: true });
      pdf.moveDown(0.5);

      pdf.fontSize(10);
      pdf.text(`Purchase No: ${purchase.purchase_number}`);
      pdf.text(`Vendor Invoice: ${purchase.vendor_invoice_no}`);
      pdf.text(`Date: ${new Date(purchase.purchase_date).toLocaleDateString('en-IN')}`);
      pdf.text(`Vendor: ${purchase.vendor?.company_name || '-'}`);
      if (purchase.vendor?.gst_number) pdf.text(`Vendor GSTIN: ${purchase.vendor.gst_number}`);
      pdf.text(`Warehouse: ${purchase.warehouse?.warehouse_name || '-'}`);
      pdf.moveDown(0.8);

      const tableTop = pdf.y;
      pdf.fontSize(8).font('Helvetica-Bold');
      let x = 40;
      pdf.text('#', x, tableTop, { width: 18 });
      x += 20;
      pdf.text('Product', x, tableTop, { width: 120 });
      x += 122;
      pdf.text('Qty', x, tableTop, { width: 28 });
      x += 30;
      pdf.text('Rate', x, tableTop, { width: 42 });
      x += 44;
      pdf.text('Taxable', x, tableTop, { width: 48 });
      x += 50;
      pdf.text('GST%', x, tableTop, { width: 32 });
      x += 34;
      pdf.text('Tax', x, tableTop, { width: 42 });

      pdf.font('Helvetica');
      let y = tableTop + 14;
      (purchase.items || []).forEach((item, idx) => {
        x = 40;
        pdf.text(String(idx + 1), x, y, { width: 18 });
        x += 20;
        pdf.text(item.product?.name || item.product_id, x, y, { width: 120 });
        x += 122;
        pdf.text(String(item.quantity), x, y, { width: 28 });
        x += 30;
        pdf.text(fmtMoney(item.purchase_cost), x, y, { width: 42 });
        x += 44;
        pdf.text(fmtMoney(item.line_subtotal), x, y, { width: 48 });
        x += 50;
        pdf.text(`${item.gst_percent || 0}%`, x, y, { width: 32 });
        x += 34;
        pdf.text(fmtMoney(item.tax_amount), x, y, { width: 42 });
        y += 14;
      });

      pdf.moveDown(2);
      pdf.fontSize(10).font('Helvetica-Bold');
      pdf.text(`Subtotal (taxable): ${fmtMoney(purchase.subtotal)}`, 300, y + 10, { align: 'right', width: 255 });
      pdf.text(`Tax Amount: ${fmtMoney(purchase.tax_amount)}`, 300, y + 26, { align: 'right', width: 255 });
      pdf.text(`Total: ${fmtMoney(purchase.total_amount)}`, 300, y + 42, { align: 'right', width: 255 });

      pdf.end();
    } catch (err) {
      reject(err);
    }
  });

const generatePurchaseEntryPdf = async (purchase) => {
  if (!purchase) throw new AppError('Purchase not found', 404, 'PURCHASE_NOT_FOUND');
  const buffer = await buildPurchaseEntryPdfBuffer(purchase);
  return { buffer, contentType: 'application/pdf' };
};

module.exports = {
  buildPurchaseEntryPdfBuffer,
  generatePurchaseEntryPdf,
};
