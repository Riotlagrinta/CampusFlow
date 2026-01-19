import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    data: { isActive: true }
  });
  console.log(`${result.count} utilisateurs ont été activés.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
