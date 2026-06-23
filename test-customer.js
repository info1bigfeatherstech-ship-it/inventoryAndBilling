const { PrismaClient } = require('@prisma/client');

async function testCustomerCreation() {
  const prisma = new PrismaClient();
  try {
    const newCustomer = await prisma.customer.create({
      data: {
        mobile: '9876543210',
        name: 'Test Customer',
        email: 'test@example.com',
        city: 'Bangalore',
        state_code: '29'
      }
    });
    console.log('✅ Customer created successfully!');
    console.log(newCustomer);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testCustomerCreation();
