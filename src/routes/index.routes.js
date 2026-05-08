// backend/src/routes/index.routes.js
const express = require('express');
const router = express.Router();

// Import versioned routes
const vendorRoutes = require('./v1/vendor.routes');
const authRoutes = require('./v1/auth.routes');

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
      authMe: 'GET /api/v1/auth/me',
      vendors: 'GET /api/v1/vendors',
      products: 'GET /api/v1/products (coming soon)',
      categories: 'GET /api/v1/categories (coming soon)',
      warehouses: 'GET /api/v1/warehouses (coming soon)',
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

// Mount versioned routes
router.use('/v1', v1Router);

module.exports = router;