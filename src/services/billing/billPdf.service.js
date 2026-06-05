const PDFDocument = require('pdfkit');
const { v2: cloudinary } = require('cloudinary');
const config = require('../../config/index.config');
const { AppError } = require('../../errors/AppError');
const {
  splitLineTaxDisplay,
  buildTaxSummaryFromLines,
} = require('../../utils/billing.utils');
const logger = require('../../utils/logger.utils');

const trimEnv = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

const fmtMoney = (n) => `₹${Number(n || 0).toFixed(2)}`;

const ensureCloudinary = () => {
  const cloudName = trimEnv(config.CLOUDINARY_CLOUD_NAME);
  const apiKey = trimEnv(config.CLOUDINARY_API_KEY);
  const apiSecret = trimEnv(config.CLOUDINARY_API_SECRET);
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError('Cloudinary is not configured for PDF upload', 503, 'CLOUDINARY_MISCONFIGURED');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
};

/**
 * Build PDF buffer for a bill (GST tax invoice or retail bill).
 * @param {object} bill - Bill with shop, items, payments
 */
const buildBillPdfBuffer = (bill) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const shop = bill.shop || {};
      const isGstInvoice = bill.bill_type === 'GST_INVOICE';
      const gstSplit = isGstInvoice
        ? buildTaxSummaryFromLines(bill.items || [])
        : { cgst: 0, sgst: 0, igst: 0 };

      doc.fontSize(16).text(shop.shop_name || 'Invoice', { align: 'center' });
      doc.fontSize(9).text('ORIGINAL FOR RECIPIENT', { align: 'right' });
      doc.moveDown(0.3);
      doc.fontSize(10).text(shop.address || '', { align: 'center' });
      doc.text(shop.city || '', { align: 'center' });
      doc.text(`Phone: ${shop.phone || '-'}`, { align: 'center' });
      doc.moveDown(0.5);

      doc.fontSize(14).text(isGstInvoice ? 'TAX INVOICE' : 'RETAIL INVOICE', { align: 'center', underline: true });
      doc.moveDown(0.5);

      const metaY = doc.y;
      doc.fontSize(9);
      doc.text(`Invoice No: ${bill.bill_number}`, 40, metaY);
      doc.text(`Date: ${new Date(bill.created_at).toLocaleDateString('en-IN')}`, 40, metaY + 12);
      doc.text(`Bill Type: ${isGstInvoice ? 'GST Tax Invoice' : 'Retail (No GST)'}`, 40, metaY + 24);
      if (bill.staff_code_value && bill.staff_name_snapshot) {
        doc.text(
          `Billing Staff: ${bill.staff_code_value} — ${bill.staff_name_snapshot}`,
          40,
          metaY + 36
        );
      }

      doc.text('Bill To:', 300, metaY, { underline: true });
      doc.text(`M/S: ${bill.customer_name || 'Walk-in Customer'}`, 300, metaY + 12);
      doc.text(`Mobile: ${bill.customer_mobile || '-'}`, 300, metaY + 24);
      if (bill.customer_gstin) doc.text(`GSTIN: ${bill.customer_gstin}`, 300, metaY + 36);
      doc.moveDown(2);

      const tableTop = doc.y;
      doc.fontSize(8).font('Helvetica-Bold');
      let colX = 40;
      doc.text('#', colX, tableTop, { width: 18 });
      colX += 20;
      doc.text('Product', colX, tableTop, { width: 120 });
      colX += 122;
      doc.text('HSN', colX, tableTop, { width: 36 });
      colX += 38;
      doc.text('Qty', colX, tableTop, { width: 28 });
      colX += 30;
      doc.text('Rate', colX, tableTop, { width: 42 });
      colX += 44;
      doc.text('Taxable', colX, tableTop, { width: 48 });
      colX += 50;

      if (isGstInvoice) {
        doc.text('CGST%', colX, tableTop, { width: 26 });
        colX += 28;
        doc.text('CGST', colX, tableTop, { width: 34, align: 'right' });
        colX += 36;
        doc.text('SGST%', colX, tableTop, { width: 26 });
        colX += 28;
        doc.text('SGST', colX, tableTop, { width: 34, align: 'right' });
        colX += 36;
        doc.text('IGST%', colX, tableTop, { width: 26 });
        colX += 28;
        doc.text('IGST', colX, tableTop, { width: 34, align: 'right' });
        colX += 36;
      }
      doc.text('Total', colX, tableTop, { width: 48, align: 'right' });

      doc.moveTo(40, tableTop + 12).lineTo(555, tableTop + 12).stroke();
      doc.font('Helvetica');

      let y = tableTop + 18;
      let sr = 0;
      for (const item of bill.items || []) {
        sr += 1;
        const name = item.variant?.product?.name || item.product?.name || item.variant?.sku || 'Item';
        const lineTax =
          isGstInvoice && item.tax_amount > 0
            ? splitLineTaxDisplay(item.tax_amount, item.gst_percent, item.gst_type)
            : null;

        colX = 40;
        doc.text(String(sr), colX, y, { width: 18 });
        colX += 20;
        doc.text(name.substring(0, 42), colX, y, { width: 120 });
        colX += 122;
        doc.text(item.hsn_code || '-', colX, y, { width: 36 });
        colX += 38;
        doc.text(String(item.quantity), colX, y, { width: 28 });
        colX += 30;
        doc.text(item.unit_price.toFixed(2), colX, y, { width: 42 });
        colX += 44;
        doc.text((item.taxable_amount ?? item.line_subtotal).toFixed(2), colX, y, { width: 48 });
        colX += 50;

        if (isGstInvoice && lineTax) {
          doc.text(lineTax.cgst > 0 ? `${lineTax.cgst_percent}%` : '-', colX, y, { width: 26 });
          colX += 28;
          doc.text(lineTax.cgst > 0 ? lineTax.cgst.toFixed(2) : '-', colX, y, { width: 34, align: 'right' });
          colX += 36;
          doc.text(lineTax.sgst > 0 ? `${lineTax.sgst_percent}%` : '-', colX, y, { width: 26 });
          colX += 28;
          doc.text(lineTax.sgst > 0 ? lineTax.sgst.toFixed(2) : '-', colX, y, { width: 34, align: 'right' });
          colX += 36;
          doc.text(lineTax.igst > 0 ? `${lineTax.igst_percent}%` : '-', colX, y, { width: 26 });
          colX += 28;
          doc.text(lineTax.igst > 0 ? lineTax.igst.toFixed(2) : '-', colX, y, { width: 34, align: 'right' });
          colX += 36;
        }
        doc.text(item.line_total.toFixed(2), colX, y, { width: 48, align: 'right' });

        y += 14;
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
      }

      y += 8;
      doc.moveTo(40, y).lineTo(555, y).stroke();
      y += 10;

      const summaryX = 320;
      doc.fontSize(9);
      doc.text(`Subtotal: ${fmtMoney(bill.subtotal)}`, summaryX, y, { align: 'right', width: 235 });
      doc.text(`Discount: ${fmtMoney(bill.discount)}`, summaryX, y + 14, { align: 'right', width: 235 });
      doc.text(`Taxable Amount: ${fmtMoney(bill.taxable_amount)}`, summaryX, y + 28, { align: 'right', width: 235 });

      let taxY = y + 42;
      if (isGstInvoice) {
        if (gstSplit.cgst > 0) {
          doc.text(`Add: CGST: ${fmtMoney(gstSplit.cgst)}`, summaryX, taxY, { align: 'right', width: 235 });
          taxY += 14;
        }
        if (gstSplit.sgst > 0) {
          doc.text(`Add: SGST: ${fmtMoney(gstSplit.sgst)}`, summaryX, taxY, { align: 'right', width: 235 });
          taxY += 14;
        }
        if (gstSplit.igst > 0) {
          doc.text(`Add: IGST: ${fmtMoney(gstSplit.igst)}`, summaryX, taxY, { align: 'right', width: 235 });
          taxY += 14;
        }
        doc.text(`Total Tax: ${fmtMoney(bill.gst_amount)}`, summaryX, taxY, { align: 'right', width: 235 });
        taxY += 14;
      }

      doc.fontSize(11).font('Helvetica-Bold');
      doc.text(`Total Amount: ${fmtMoney(bill.total_amount)}`, summaryX, taxY + 4, { align: 'right', width: 235 });
      doc.font('Helvetica').fontSize(8);

      doc.moveDown(2);
      doc.text(
        `Payment: ${bill.payment_status}${bill.payment_method ? ` (${bill.payment_method})` : ''} | Paid: ${fmtMoney(bill.paid_amount)} | Balance: ${fmtMoney(bill.balance_amount)}`,
        40,
        doc.y
      );

      if (bill.payment_method === 'UPI' && bill.bank_account) {
        const bank = bill.bank_account;
        let payY = doc.y + 14;
        doc.fontSize(8).text('Payment Details:', 40, payY, { underline: true });
        payY += 12;
        doc.text(`Method: UPI`, 40, payY);
        payY += 11;
        doc.text(`Bank: ${bank.bank_name || '-'}`, 40, payY);
        payY += 11;
        if (bank.ifsc_code) doc.text(`IFSC: ${bank.ifsc_code}`, 40, payY);
        payY += 11;
        if (bank.upi_id) doc.text(`UPI ID: ${bank.upi_id}`, 40, payY);
        const upiRef = bill.payments?.find((p) => p.reference_no)?.reference_no;
        if (upiRef) {
          payY += 11;
          doc.text(`Transaction Ref: ${upiRef}`, 40, payY);
        }
      }

      doc.fontSize(8).text('This is a computer generated invoice.', { align: 'center' });

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
        resolve({
          pdf_storage_key: result.public_id,
          pdf_url: result.secure_url,
        });
      }
    );
    stream.end(buffer);
  });
};

const generateBillPdf = async (bill, { persist = true } = {}) => {
  const buffer = await buildBillPdfBuffer(bill);
  if (!persist) {
    return { buffer, contentType: 'application/pdf' };
  }
};

module.exports = {
  buildBillPdfBuffer,
  generateBillPdf,
};
