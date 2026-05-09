// backend/src/server.js
const http = require('http');
const app = require('./app');
const logger = require('./src/utils/logger.utils');
const config = require('./src/config/index.config');
const prisma = require('./src/utils/prisma.utils');
const shutdownService = require('./src/services/shutdown.service');
const healthService = require('./src/services/health.service');
const connectivityService = require('./src/services/connectivity.service');
const { printStartupBanner } = require('./src/utils/startupBanner.utils');
const { ensureSuperAdmin } = require('./src/services/auth/adminBootstrap.service');
const pkg = require('./package.json');

const PORT = config.PORT;
let server = null;

async function validateDatabaseConnection() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error.message);
    return false;
  }
}

async function startServer() {
  logger.info('Starting Vyaapar Inventory & Billing System');
  logger.info(`Environment: ${config.NODE_ENV}`);
  logger.info(`Node.js version: ${process.version}`);

  // Validate database connection
  const dbConnected = await validateDatabaseConnection();
  if (!dbConnected) {
    logger.error('Cannot start server without database connection');
    process.exit(1);
  }

  await ensureSuperAdmin();

  // Connectivity snapshot logs for external dependencies
  const connectivity = await connectivityService.getSnapshot();
  logger.info('Connectivity check: database', connectivity.database);
  logger.info('Connectivity check: redis', connectivity.redis);
  logger.info('Connectivity check: cloudflare_r2', connectivity.cloudflareR2);

  // Create HTTP server
  server = http.createServer(app);
  
  // Register with shutdown service
  shutdownService.registerServer(server);
  shutdownService.registerConnection('Prisma', async () => {
    await prisma.$disconnect();
    logger.info('Prisma disconnected');
  });

  // Setup process handlers
  shutdownService.setupProcessHandlers();

  // Start listening
  server.listen(PORT, () => {
    const apiUrl = `http://localhost:${PORT}/api/${config.API_VERSION}`;
    const healthUrl = `http://localhost:${PORT}/health`;
    const readyUrl = `http://localhost:${PORT}/ready`;
    const liveUrl = `http://localhost:${PORT}/live`;

    printStartupBanner({
      appName: 'Vyaapar Inventory & Billing API',
      version: `v${pkg.version}`,
      env: config.NODE_ENV,
      port: PORT,
      apiUrl,
      healthUrl,
      readyUrl,
      liveUrl,
      connectivity,
      redisRateLimitEnabled: config.ENABLE_REDIS_RATE_LIMIT,
      databaseUrl: config.DATABASE_URL,
    });

    // Keep structured logs too (useful on VPS log aggregators)
    logger.info('Server started', {
      port: PORT,
      environment: config.NODE_ENV,
      apiUrl,
      healthUrl,
      readyUrl,
      liveUrl,
      connectivity,
    });
  });
}

// Start the server
startServer().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});