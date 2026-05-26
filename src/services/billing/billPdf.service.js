const PDFDocument = require('pdfkit');
const { v2: cloudinary } = require('cloudinary');
const config = require('../../config/index.config');
const { AppError } = require('../../errors/AppError');
const { splitGstComponents } = require('../../utils/billing.utils');
const logger = require('../../utils/logger.utils');

const trimEnv = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

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
 * Build PDF buffer for a bill.
 * @param {object} bill - Bill with shop, items, payments
 */
const buildBillPdfBuffer = (bill) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const shop = bill.shop || {};
      const intraState =
        bill.place_of_supply_state_code && shop.state_code
          ? bill.place_of_supply_state_code === shop.state_code
          : true;
      const gstSplit = splitGstComponents(bill.gst_amount, intraState);

      doc.fontSize(18).text(shop.shop_name || 'Tax Invoice', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(shop.address || '', { align: 'center' });
      doc.text(`${shop.city || ''}${shop.state_code ? ` | State: ${shop.state_code}` : ''}`, { align: 'center' });
      doc.text(`Phone: ${shop.phone || '-'}`, { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Invoice: ${bill.bill_number}`, { continued: true }).text(`   Date: ${new Date(bill.created_at).toLocaleString('en-IN')}`, { align: 'right' });
      doc.text(`Bill ID: ${bill.bill_id}`);
      doc.text(`Type: ${bill.bill_type}`);
      doc.moveDown();

      doc.fontSize(11).text('Bill To:', { underline: true });
      doc.fontSize(10).text(`Name: ${bill.customer_name || 'Walk-in Customer'}`);
      doc.text(`Mobile: ${bill.customer_mobile || '-'}`);
      if (bill.customer_gstin) doc.text(`GSTIN: ${bill.customer_gstin}`);
      doc.text(`Place of Supply: ${bill.place_of_supply_state_code || shop.state_code || '-'}`);
      doc.moveDown();

      const tableTop = doc.y;
      doc.fontSize(9);
      doc.text('Item', 50, tableTop, { width: 180 });
      doc.text('HSN', 230, tableTop);
      doc.text('Qty', 280, tableTop);
      doc.text('Rate', 320, tableTop);
      doc.text('Tax%', 370, tableTop);
      doc.text('Amount', 420, tableTop, { align: 'right' });
      doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).stroke();

      let y = tableTop + 20;
      for (const item of bill.items || []) {
        const name = item.variant?.product?.name || item.product?.name || item.variant?.sku || 'Item';
        doc.text(name.substring(0, 40), 50, y, { width: 175 });
        doc.text(item.hsn_code || '-', 230, y);
        doc.text(String(item.quantity), 280, y);
        doc.text(item.unit_price.toFixed(2), 320, y);
        doc.text(`${item.gst_percent}%`, 370, y);
        doc.text(item.line_total.toFixed(2), 420, y, { align: 'right' });
        y += 16;
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
      }

      doc.moveDown(2);
      y = Math.max(y + 10, doc.y);
      doc.text(`Subtotal: ₹${bill.subtotal.toFixed(2)}`, 350, y, { align: 'right' });
      doc.text(`Discount: ₹${bill.discount.toFixed(2)}`, 350, y + 14, { align: 'right' });
      doc.text(`Taxable: ₹${bill.taxable_amount.toFixed(2)}`, 350, y + 28, { align: 'right' });
      if (gstSplit.cgst > 0) doc.text(`CGST: ₹${gstSplit.cgst.toFixed(2)}`, 350, y + 42, { align: 'right' });
      if (gstSplit.sgst > 0) doc.text(`SGST: ₹${gstSplit.sgst.toFixed(2)}`, 350, y + 56, { align: 'right' });
      if (gstSplit.igst > 0) doc.text(`IGST: ₹${gstSplit.igst.toFixed(2)}`, 350, y + 42, { align: 'right' });
      doc.fontSize(12).text(`Total: ₹${bill.total_amount.toFixed(2)}`, 350, y + 76, { align: 'right' });

      doc.moveDown(2);
      doc.fontSize(8).text(`Payment: ${bill.payment_status}${bill.payment_method ? ` (${bill.payment_method})` : ''}`);
      doc.text(`Verify: ${bill.bill_number}`, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });

/**
 * Upload PDF to Cloudinary and return storage key + URL.
 */
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

/**
 * Generate PDF for bill, and  do not store in the cloudinary  anymore remove the cloudinary upload part.
 */
const generateBillPdf = async (bill, { persist = true } = {}) => {
  const buffer = await buildBillPdfBuffer(bill);
  if (!persist) {
    return { buffer, contentType: 'application/pdf' };
  }

  // try {
  //   const uploaded = await uploadBillPdf(buffer, bill.bill_number);
  //   logger.info('Bill PDF uploaded', { bill_id: bill.bill_id, storage_key: uploaded.pdf_storage_key });
  //   return { buffer, ...uploaded, contentType: 'application/pdf' };
  // } catch (err) {
  //   logger.warn('Bill PDF upload failed, returning buffer only', { bill_id: bill.bill_id, error: err.message });
  //   return { buffer, contentType: 'application/pdf', upload_failed: true };
  // }
};

module.exports = {
  buildBillPdfBuffer,
  generateBillPdf,
};
