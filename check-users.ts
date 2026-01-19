import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, isActive: true, role: true }
  });
  console.log('Users found:', users);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
