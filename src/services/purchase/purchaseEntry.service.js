const prisma = require('../../utils/prisma.utils');
const { parsePagination } = require('../../utils/pagination.utils');

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
  vendor: { select: { vendor_id: true, company_name: true } },
  warehouse: { select: { warehouse_id: true, warehouse_code: true, warehouse_name: true } },
};

const purchaseEntryService = {
  async listPurchaseEntries(query = {}, user) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50 });
    
    const where = {};
    if (query.vendor_id) where.vendor_id = query.vendor_id;
    if (query.warehouse_id) where.warehouse_id = query.warehouse_id;
    if (query.status) where.status = query.status;
    
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
  
  async getPurchaseEntryById(purchaseId, user) {
    const purchase = await prisma.purchaseEntry.findUnique({
      where: { purchase_id: purchaseId },
      select: {
        ...PURCHASE_SELECT,
        items: {
          select: {
            purchase_item_id: true,
            product_id: true,
            quantity: true,
            purchase_cost: true,
            batch_number: true,
            expiry_date: true,
            product: { select: { product_id: true, product_code: true, name: true } },
          },
        },
      },
    });
    
    if (!purchase) throw new AppError('Purchase entry not found', 404);
    
    if (user.role !== 'SUPER_ADMIN' && user.warehouseId && purchase.warehouse_id !== user.warehouseId) {
      throw new AppError('Purchase entry not found', 404);
    }
    
    return purchase;
  },
};

module.exports = purchaseEntryService;