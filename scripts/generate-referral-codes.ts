import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Génération des codes de parrainage pour les utilisateurs existants...');

  const users = await prisma.user.findMany({
    where: { referralCode: null }
  });

  for (const user of users) {
    const shortCode = (user.firstName?.substring(0, 3) || 'DEFI').toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    
    await prisma.user.update({
      where: { id: user.id },
      data: { referralCode: shortCode }
    });
    console.log(`✅ Code généré pour ${user.email} : ${shortCode}`);
  }

  console.log('✨ Terminé !');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
