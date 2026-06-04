const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');
const { generatePurchaseEntryPdf } = require('./purchaseEntryPdf.service');
const { buildPurchaseDisplayLines } = require('../../utils/purchaseDisplay.utils');

const PURCHASE_SELECT = {
  purchase_id: true,
  purchase_number: true,
  vendor_id: true,
  warehouse_id: true,
  vendor_invoice_no: true,
  purchase_date: true,
  status: true,
  subtotal: true,
  tax_amount: true,
  total_amount: true,
  received_by: true,
  received_at: true,
  remarks: true,
  created_at: true,
  updated_at: true,
  vendor: {
    select: {
      vendor_id: true,
      company_name: true,
      phone: true,
    },
  },
  warehouse: {
    select: {
      warehouse_id: true,
      warehouse_code: true,
      warehouse_name: true,
      city: true,
    },
  },
};

const PurchaseEntryService = {
  /**
   * List purchase entries with pagination and filters
   */
  async listPurchaseEntries(query = {}, user) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });

    const where = {};

    // Apply filters
    if (query.vendor_id) where.vendor_id = query.vendor_id;
    if (query.warehouse_id) where.warehouse_id = query.warehouse_id;
    if (query.status) where.status = query.status;

    // Date range filter
    if (query.from_date || query.to_date) {
      where.purchase_date = {};
      if (query.from_date) where.purchase_date.gte = new Date(query.from_date);
      if (query.to_date) where.purchase_date.lte = new Date(query.to_date);
    }

    // Search filter
    if (query.search) {
      const search = String(query.search).trim();
      where.OR = [
        { purchase_number: { contains: search, mode: 'insensitive' } },
        { vendor_invoice_no: { contains: search, mode: 'insensitive' } },
        { vendor: { company_name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Role-based warehouse isolation
    if (user.role !== 'SUPER_ADMIN' && user.warehouseId) {
      where.warehouse_id = user.warehouseId;
    }

    const [total, purchases] = await Promise.all([
      prisma.purchaseEntry.count({ where }),
      prisma.purchaseEntry.findMany({
        where,
        skip,
        take,
        orderBy: { purchase_date: 'desc' },
        select: PURCHASE_SELECT,
      }),
    ]);

    return { total, page, limit, purchases };
  },

  /**
   * Get single purchase entry by ID with items
   */
  async getPurchaseEntryById(purchaseId, user) {
    const purchase = await prisma.purchaseEntry.findUnique({
      where: { purchase_id: purchaseId },
      select: {
        ...PURCHASE_SELECT,
        items: {
          select: {
            purchase_item_id: true,
            product_id: true,
            variant_id: true,
            quantity: true,
            purchase_cost: true,
            line_subtotal: true,
            gst_percent: true,
            tax_amount: true,
            batch_number: true,
            expiry_date: true,
            room_zone: true,
            rack_shelf: true,
            position: true,
            remarks: true,
            product: {
              select: {
                product_id: true,
                product_code: true,
                name: true,
                hsn_code: true,
              },
            },
            variant: {
              select: {
                variant_id: true,
                sku: true,
                product_code: true,
                system_barcode: true,
                attributes: true,
              },
            },
          },
        },
      },
    });

    if (!purchase) {
      throw new AppError('Purchase entry not found', 404, 'PURCHASE_NOT_FOUND');
    }

    // Role-based warehouse isolation
    if (user.role !== 'SUPER_ADMIN' && user.warehouseId && purchase.warehouse_id !== user.warehouseId) {
      throw new AppError('Purchase entry not found', 404, 'PURCHASE_NOT_FOUND');
    }

    const display = buildPurchaseDisplayLines(purchase.items);

    return {
      ...purchase,
      display_lines: display.lines,
      display_lines_by_variant: display.lines_by_variant,
    };
  },

  /**
   * Get purchase summary by vendor (for reports)
   */
  async getPurchaseSummaryByVendor(query = {}, user) {
    const { from_date, to_date } = query;

    const where = {};
    if (from_date || to_date) {
      where.purchase_date = {};
      if (from_date) where.purchase_date.gte = new Date(from_date);
      if (to_date) where.purchase_date.lte = new Date(to_date);
    }

    if (user.role !== 'SUPER_ADMIN' && user.warehouseId) {
      where.warehouse_id = user.warehouseId;
    }

    const summary = await prisma.purchaseEntry.groupBy({
      by: ['vendor_id'],
      where,
      _sum: {
        subtotal: true,
        tax_amount: true,
        total_amount: true,
      },
      _count: {
        purchase_id: true,
      },
    });

    // Get vendor details for each summary row
    const vendorIds = summary.map((s) => s.vendor_id);
    const vendors = await prisma.vendor.findMany({
      where: { vendor_id: { in: vendorIds } },
      select: { vendor_id: true, company_name: true },
    });

    const vendorMap = new Map(vendors.map((v) => [v.vendor_id, v.company_name]));

    const enrichedSummary = summary.map((s) => ({
      vendor_id: s.vendor_id,
      vendor_name: vendorMap.get(s.vendor_id) || 'Unknown',
      total_purchases: s._count.purchase_id,
      total_subtotal: s._sum.subtotal || 0,
      total_tax: s._sum.tax_amount || 0,
      total_amount: s._sum.total_amount || 0,
    }));

    return enrichedSummary;
  },

  async generatePurchasePdf(purchaseId, user) {
    const purchase = await this.getPurchaseEntryById(purchaseId, user);
    return generatePurchaseEntryPdf(purchase);
  },
};

module.exports = PurchaseEntryService;