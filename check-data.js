const { PrismaClient } = require('@prisma/client');

async function checkData() {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.customer.count();
    console.log('✅ Total customers in database:', count);
    
    if (count > 0) {
      const sample = await prisma.customer.findFirst();
      console.log('📝 Sample customer:', sample);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
