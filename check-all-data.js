const { PrismaClient } = require('@prisma/client');

async function checkAllData() {
  const prisma = new PrismaClient();
  try {
    // Check all important tables
    const tables = [
      { name: 'customers', model: prisma.customer },
      { name: 'vendors', model: prisma.vendor },
      { name: 'warehouses', model: prisma.warehouse },
      { name: 'shops', model: prisma.shop },
      { name: 'products', model: prisma.product },
      { name: 'bills', model: prisma.bill },
      { name: 'users', model: prisma.user },
    ];

    console.log('📊 DATABASE DATA CHECK:\n');
    
    for (const table of tables) {
      try {
        const count = await table.model.count();
        console.log(`${table.name.toUpperCase()}: ${count} records`);
      } catch (e) {
        console.log(`${table.name.toUpperCase()}: Error checking`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllData();
