// backend/src/routes/index.routes.js
const express = require('express');
const router = express.Router();

// Import versioned routes (domain folders under routes/)
const vendorRoutes = require('./vendor/vendor.routes');
const authRoutes = require('./auth/auth.routes');
const warehouseRoutes = require('./warehouse/warehouse.routes');
const userRoutes = require('./user/user.routes');
const inwardRoutes = require('./inward/inward.routes');
const categoryRoutes = require('./category/category.routes');
const productRoutes = require('./product/product.routes');
const productStockRoutes = require('./product/productStock.routes');
const shopRoutes = require('./shop/shop.routes');
const shopStockRoutes = require('./shop/shopStock.routes');
// const stockTransferRoutes = require('./stock/stockTransfer.routes');
const transferRequestRoutes = require('./stock/transferRequest.routes');
const stockSearchRoutes = require('./stock/stockSearch.routes');
const bulkTransferRoutes = require('./stock/bulkTransfer.routes');
const shopProductLevelRoutes = require('./stock/shopProductLevel.routes');
const shopReorderRoutes = require('./stock/shopReorder.routes');
const stockLedgerRoutes = require('./stock/stockLedger.routes');
const purchaseEntryRoutes = require('./purchase/purchaseEntry.routes');
const warehouseExpenseRoutes = require('./purchase/warehouseExpense.routes');
const shopExpenseRoutes = require('./purchase/shopExpense.routes');
const vendorPaymentRoutes = require('./purchase/vendorPayment.routes');
const customerRoutes = require('./customer/customer.routes');
const billingRoutes = require('./billing/billing.routes');
const creditNoteRoutes = require('./creditNote/creditNote.routes');
const debitNoteRoutes = require('./debitNote/debitNote.routes');
const cashbankRoutes = require('./cashbank/cashbank.routes');
const dashboardRoutes = require('./dashboard/dashboard.routes');
const syncRoutes = require('./sync/sync.routes');
const backupRoutes = require('./backup/backup.routes');
const appSettingsRoutes = require('./settings/appSettings.routes');

// API info route
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Vyaapar API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    endpoints: {
      health: 'GET /health',
      api: 'GET /api/v1',
      authLogin: 'POST /api/v1/auth/login',
      authRefresh: 'POST /api/v1/auth/refresh',
      authLogout: 'POST /api/v1/auth/logout',
      authMe: 'GET /api/v1/auth/me',
      vendors: 'GET /api/v1/vendors',
      products: 'GET /api/v1/products',
      productStocks: 'GET /api/v1/product-stocks',
      warehousePeerStock: 'GET /api/v1/warehouses/peer-stock-summary',
      categories: 'GET /api/v1/categories',
      warehouses: 'GET /api/v1/warehouses',
      users: 'GET /api/v1/users',
      inwards: 'GET /api/v1/inwards',
      shops: 'GET /api/v1/shops',
      shopStocks: 'GET /api/v1/shop-stocks',
      stockTransfers: 'POST /api/v1/stock/transfer/wh-to-shop',
      transferRequests: 'GET /api/v1/transfer-requests',
      stockSearch: 'GET /api/v1/stock/search',
      bulkTransferRequests: 'POST /api/v1/bulk-transfer-requests',
      shopReorderSuggestions: 'GET /api/v1/shop-reorder-suggestions',
      stockLedger: 'GET /api/v1/stock/ledger',
      customers: 'GET /api/v1/customers',
      bills: 'POST /api/v1/bills',
      creditNotes: 'POST /api/v1/credit-notes',
      debitNotes: 'POST /api/v1/debit-notes',
    },
    requestId: req.id,
  });
});

// Version 1 routes (placeholder)
const v1Router = express.Router();

v1Router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API v1 endpoint',
    requestId: req.id,
  });
});

// Mount v1 resources
v1Router.use('/auth', authRoutes);
v1Router.use('/vendors', vendorRoutes);
v1Router.use('/warehouses', warehouseRoutes);
v1Router.use('/users', userRoutes);
v1Router.use('/inwards', inwardRoutes);
v1Router.use('/categories', categoryRoutes);
v1Router.use('/product-stocks', productStockRoutes);
v1Router.use('/products', productRoutes);
v1Router.use('/shops', shopRoutes);
v1Router.use('/shop-stocks', shopStockRoutes);
// v1Router.use('/stock', stockTransferRoutes);
v1Router.use('/stock/search', stockSearchRoutes);
v1Router.use('/transfer-requests', transferRequestRoutes);
v1Router.use('/bulk-transfer-requests', bulkTransferRoutes);
v1Router.use('/shop-product-levels', shopProductLevelRoutes);
v1Router.use('/shop-reorder-suggestions', shopReorderRoutes);
v1Router.use('/stock/ledger', stockLedgerRoutes);
v1Router.use('/purchase-entries', purchaseEntryRoutes);
v1Router.use('/warehouse-expenses', warehouseExpenseRoutes);
v1Router.use('/shop-expenses', shopExpenseRoutes);
v1Router.use('/vendor-payments', vendorPaymentRoutes);
v1Router.use('/customers', customerRoutes);
v1Router.use('/bills', billingRoutes);
v1Router.use('/credit-notes', creditNoteRoutes);
v1Router.use('/debit-notes', debitNoteRoutes);
v1Router.use('/cashbank', cashbankRoutes);
v1Router.use('/dashboard', dashboardRoutes);
v1Router.use('/sync', syncRoutes);
v1Router.use('/backups', backupRoutes);
v1Router.use('/settings', appSettingsRoutes);
// Mount versioned routes
router.use('/v1', v1Router);

module.exports = router;