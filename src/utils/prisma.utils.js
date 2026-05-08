// backend/src/utils/prisma.js
const { PrismaClient } = require('@prisma/client');
const logger = require('./logger.utils');
const config = require('../config/index.config');

class PrismaSingleton {
  static instance = null;
  static prisma = null;

  constructor() {
    if (!PrismaSingleton.prisma) {
      PrismaSingleton.prisma = new PrismaClient({
        log: config.isDevelopment 
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
        errorFormat: 'pretty',
      });
      
      // Add event listeners
      PrismaSingleton.prisma.$on('query', (e) => {
        if (config.isDevelopment) {
          logger.debug(`Query: ${e.query} - ${e.duration}ms`);
        }
      });
      
      PrismaSingleton.prisma.$on('error', (e) => {
        logger.error(`Prisma error: ${e.message}`);
      });
    }
  }

  getInstance() {
    return PrismaSingleton.prisma;
  }
}

const prisma = new PrismaSingleton().getInstance();
module.exports = prisma;