// backend/src/routes/health.routes.js
const express = require('express');
const router = express.Router();
const healthService = require('../services/health.service');

// Health check
router.get('/health', async (req, res) => {
  const health = await healthService.getFullHealth(req.id);
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Readiness probe
router.get('/ready', async (req, res) => {
  const readiness = await healthService.getReadiness();
  const statusCode = readiness.status === 'ready' ? 200 : 503;
  res.status(statusCode).json(readiness);
});

// Liveness probe
router.get('/live', (req, res) => {
  res.status(200).json(healthService.getLiveness());
});

module.exports = router;