import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, password: true, isActive: true, role: true }
  });
  console.log('--- Liste des utilisateurs en base ---');
  users.forEach(u => {
    console.log(`Email: ${u.email} | Pass: ${u.password} | Active: ${u.isActive} | Role: ${u.role}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
