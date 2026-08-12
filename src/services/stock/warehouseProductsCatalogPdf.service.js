/**
 * A4 landscape warehouse products catalog PDF for shop Transfers tab.
 * Fail-soft on images; never throws for a single missing image.
 */

const PDFDocument = require('pdfkit');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const logger = require('../../utils/logger.utils');

/** A4 landscape in PDF points (297mm × 210mm) */
const PAGE = { width: 841.89, height: 595.28, margin: 20 };
const PDF_PAGE_OPTS = { size: 'A4', layout: 'landscape' };
const IMG_SIZE = 38;
const ROW_H = 46;
const HEADER_H = 24;
const IMAGE_TIMEOUT_MS = 4000;
const IMAGE_CONCURRENCY = 8;

const TABLE_WIDTH = PAGE.width - PAGE.margin * 2;

const fmtMoney = (n) => {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(2);
};

const fmtCombo = (row) => {
  if (row.combo_unit_price == null || row.combo_trigger_qty == null) return '—';
  return `${Number(row.combo_unit_price).toFixed(2)}/${row.combo_trigger_qty}`;
};

const displayProductName = (name) => {
  const n = String(name || '').trim();
  if (!n) return '—';
  return n.length > 30 ? `${n.slice(0, 30)}…` : n;
};

const fetchImageBuffer = (url, redirectDepth = 0) =>
  new Promise((resolve) => {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url) || redirectDepth > 3) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (buf) => {
      if (settled) return;
      settled = true;
      resolve(buf);
    };

    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.get(
        url,
        {
          timeout: IMAGE_TIMEOUT_MS,
          headers: { Accept: 'image/*' },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            fetchImageBuffer(res.headers.location, redirectDepth + 1).then(done);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            done(null);
            return;
          }
          const chunks = [];
          let total = 0;
          const MAX = 1.5 * 1024 * 1024;
          res.on('data', (c) => {
            total += c.length;
            if (total > MAX) {
              res.destroy();
              done(null);
              return;
            }
            chunks.push(c);
          });
          res.on('end', () => done(Buffer.concat(chunks)));
          res.on('error', () => done(null));
        }
      );
      req.on('timeout', () => {
        req.destroy();
        done(null);
      });
      req.on('error', () => done(null));
    } catch {
      done(null);
    }
  });

const mapPool = async (items, concurrency, mapper) => {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx;
      idx += 1;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
};

const buildColumns = (showFranchise, showPurchase) => {
  let weights;
  if (showFranchise && showPurchase) {
    weights = [
      { key: 'img', label: 'Img', weight: 4 },
      { key: 'code', label: 'Code', weight: 6 },
      { key: 'name', label: 'Product / Variant', weight: 17 },
      { key: 'brand', label: 'Brand', weight: 8 },
      { key: 'warranty', label: 'Warranty', weight: 6 },
      { key: 'mrp', label: 'MRP', weight: 8 },
      { key: 'fprice', label: 'F. Price', weight: 8 },
      { key: 'purchase', label: 'Purchase', weight: 8 },
      { key: 'special', label: 'Special Price', weight: 8 },
      { key: 'combo', label: 'Combo Price/qty', weight: 8 },
      { key: 'stock', label: 'WH Stock', weight: 19 },
    ];
  } else if (showFranchise || showPurchase) {
    weights = [
      { key: 'img', label: 'Img', weight: 5 },
      { key: 'code', label: 'Code', weight: 7 },
      { key: 'name', label: 'Product / Variant', weight: 20 },
      { key: 'brand', label: 'Brand', weight: 9 },
      { key: 'warranty', label: 'Warranty', weight: 7 },
      { key: 'mrp', label: 'MRP', weight: 9 },
    ];
    if (showFranchise) weights.push({ key: 'fprice', label: 'F. Price', weight: 9 });
    if (showPurchase) weights.push({ key: 'purchase', label: 'Purchase', weight: 9 });
    weights.push(
      { key: 'special', label: 'Special Price', weight: 9 },
      { key: 'combo', label: 'Combo Price/qty', weight: 9 },
      { key: 'stock', label: 'WH Stock', weight: 16 }
    );
  } else {
    weights = [
      { key: 'img', label: 'Img', weight: 5 },
      { key: 'code', label: 'Code', weight: 8 },
      { key: 'name', label: 'Product / Variant', weight: 24 },
      { key: 'brand', label: 'Brand', weight: 10 },
      { key: 'warranty', label: 'Warranty', weight: 8 },
      { key: 'mrp', label: 'MRP', weight: 11 },
      { key: 'special', label: 'Special Price', weight: 11 },
      { key: 'combo', label: 'Combo Price/qty', weight: 11 },
      { key: 'stock', label: 'WH Stock', weight: 12 },
    ];
  }

  const totalWeight = weights.reduce((s, c) => s + c.weight, 0);
  const cols = weights.map((col) => ({
    ...col,
    w: Math.floor((TABLE_WIDTH * col.weight) / totalWeight),
  }));
  const used = cols.reduce((s, c) => s + c.w, 0);
  if (cols.length && used < TABLE_WIDTH) {
    cols[cols.length - 1].w += TABLE_WIDTH - used;
  }
  return cols;
};

const drawHeaderBar = (doc, catalog, y) => {
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a');
  doc.text('Warehouse Products Catalog', PAGE.margin, y, { lineBreak: false });
  y += 20;
  doc.font('Helvetica').fontSize(9).fillColor('#475569');
  const meta = [
    `Shop: ${catalog.shop_name || catalog.shop_code || catalog.shop_id}`,
    `Warehouse: ${catalog.warehouse_name || ''} (${catalog.warehouse_code || catalog.warehouse_id})`,
    `Variants: ${catalog.meta?.total_variants ?? catalog.rows?.length ?? 0}`,
    `Sorted by: Product code ASC`,
    `Generated: ${new Date(catalog.meta?.generated_at || Date.now()).toLocaleString('en-IN')}`,
  ].join('   |   ');
  doc.text(meta, PAGE.margin, y, {
    width: TABLE_WIDTH,
    lineBreak: false,
  });
  return y + 18;
};

const drawTableHeader = (doc, cols, y) => {
  let x = PAGE.margin;
  doc.save();
  doc.rect(PAGE.margin, y, TABLE_WIDTH, HEADER_H).fill('#f1f5f9');
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155');
  const rightCols = new Set(['mrp', 'fprice', 'purchase', 'special', 'combo', 'stock']);
  for (const col of cols) {
    doc.text(col.label, x + 4, y + 8, {
      width: col.w - 8,
      align: rightCols.has(col.key) ? 'right' : 'left',
      lineBreak: false,
    });
    x += col.w;
  }
  return y + HEADER_H;
};

/**
 * @param {object} catalog — from buildWarehouseProductsRows
 * @returns {Promise<Buffer>}
 */
const buildWarehouseProductsCatalogPdf = async (catalog) => {
  const rows = Array.isArray(catalog?.rows) ? catalog.rows : [];
  const showFranchise = catalog?.show_franchise_price === true;
  const showPurchase = catalog?.show_purchase_price === true;
  const cols = buildColumns(showFranchise, showPurchase);

  const imageBuffers = await mapPool(rows, IMAGE_CONCURRENCY, async (row) => {
    try {
      return await fetchImageBuffer(row.image_url);
    } catch (err) {
      logger.warn('Catalog PDF image fetch failed', { url: row.image_url, error: err.message });
      return null;
    }
  });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        ...PDF_PAGE_OPTS,
        margins: {
          top: PAGE.margin,
          bottom: PAGE.margin,
          left: PAGE.margin,
          right: PAGE.margin,
        },
        autoFirstPage: true,
        info: {
          Title: 'Warehouse Products Catalog',
          Author: 'Vyaapar',
        },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let y = drawHeaderBar(doc, catalog, PAGE.margin);
      y = drawTableHeader(doc, cols, y + 4);

      const pageBottom = PAGE.height - PAGE.margin;

      rows.forEach((row, index) => {
        if (y + ROW_H > pageBottom) {
          doc.addPage({
            ...PDF_PAGE_OPTS,
            margins: {
              top: PAGE.margin,
              bottom: PAGE.margin,
              left: PAGE.margin,
              right: PAGE.margin,
            },
          });
          y = PAGE.margin;
          y = drawHeaderBar(doc, catalog, y);
          y = drawTableHeader(doc, cols, y + 4);
        }

        if (index % 2 === 1) {
          doc.save();
          doc.rect(PAGE.margin, y, TABLE_WIDTH, ROW_H).fill('#f8fafc');
          doc.restore();
        }

        let x = PAGE.margin;
        const textY = y + 15;
        const rightCols = new Set(['mrp', 'fprice', 'purchase', 'special', 'combo', 'stock']);
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a');

        for (const col of cols) {
          if (col.key === 'img') {
            const buf = imageBuffers[index];
            const ix = x + 4;
            const iy = y + (ROW_H - IMG_SIZE) / 2;
            doc.save();
            doc.roundedRect(ix, iy, IMG_SIZE, IMG_SIZE, 3).stroke('#e2e8f0');
            doc.restore();
            if (buf) {
              try {
                doc.image(buf, ix + 1, iy + 1, {
                  fit: [IMG_SIZE - 2, IMG_SIZE - 2],
                  align: 'center',
                  valign: 'center',
                });
              } catch {
                doc.fontSize(8).fillColor('#94a3b8').text('N/A', ix + 10, iy + 18, { lineBreak: false });
              }
            } else {
              doc.fontSize(8).fillColor('#94a3b8').text('N/A', ix + 10, iy + 18, { lineBreak: false });
            }
          } else {
            let value = '—';
            if (col.key === 'code') value = row.product_code || '—';
            else if (col.key === 'name') value = displayProductName(row.product_name);
            else if (col.key === 'brand') value = row.brand_name || '—';
            else if (col.key === 'warranty') value = row.warranty || '—';
            else if (col.key === 'mrp') value = fmtMoney(row.mrp);
            else if (col.key === 'fprice') value = fmtMoney(row.franchise_unit_price);
            else if (col.key === 'purchase') value = fmtMoney(row.purchase_price);
            else if (col.key === 'special') value = fmtMoney(row.special_price);
            else if (col.key === 'combo') value = fmtCombo(row);
            else if (col.key === 'stock') {
              value = row.out_of_stock ? 'Out of stock' : String(row.warehouse_available ?? 0);
            }

            doc
              .font(col.key === 'stock' && row.out_of_stock ? 'Helvetica-Bold' : 'Helvetica')
              .fontSize(col.key === 'name' ? 8.5 : 9)
              .fillColor(row.out_of_stock && col.key === 'stock' ? '#b45309' : '#0f172a')
              .text(String(value), x + 4, textY, {
                width: col.w - 8,
                height: ROW_H - 16,
                align: rightCols.has(col.key) ? 'right' : 'left',
                ellipsis: true,
                lineBreak: false,
              });
          }
          x += col.w;
        }

        y += ROW_H;
      });

      if (rows.length === 0) {
        doc.font('Helvetica').fontSize(11).fillColor('#64748b');
        doc.text('No products found for this warehouse.', PAGE.margin, y + 24);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  buildWarehouseProductsCatalogPdf,
  PAGE,
  PDF_PAGE_OPTS,
};
