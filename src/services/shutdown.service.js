// backend/src/services/shutdown.service.js
const logger = require('../utils/logger.utils');

class ShutdownService {
  constructor() {
    this.connections = new Map();
    this.server = null;
    this.isShuttingDown = false;
    this.timeout = 30000; // 30 seconds
  }

  registerServer(server) {
    this.server = server;
  }

  registerConnection(name, cleanupFn) {
    this.connections.set(name, cleanupFn);
  }

  async shutdown() {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }
    
    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    // Close HTTP server
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      logger.info('HTTP server closed');
    }

    // Cleanup all connections
    const cleanupPromises = [];
    for (const [name, cleanupFn] of this.connections) {
      logger.info(`Cleaning up: ${name}`);
      cleanupPromises.push(
        cleanupFn().catch(err => {
          logger.error(`Error cleaning up ${name}:`, err);
        })
      );
    }

    // Wait for all cleanups with timeout
    await Promise.race([
      Promise.all(cleanupPromises),
      new Promise(resolve => setTimeout(resolve, this.timeout))
    ]);

    logger.info('Graceful shutdown completed');
  }

  setupProcessHandlers() {
    const shutdownHandler = async (signal) => {
      logger.info(`Received ${signal}, starting shutdown...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);
    
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception:', error);
      await this.shutdown();
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason) => {
      logger.error('Unhandled rejection:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }
}

module.exports = new ShutdownService();