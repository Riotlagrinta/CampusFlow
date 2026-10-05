/**
 * Statistiques de comptes (lecture seule) : compteurs uniquement, aucun email, hash ni code.
 *
 *   npx tsx scripts/check-users.ts --yes
 *
 * Refusé avec NODE_ENV=production.
 */
import { PrismaClient } from '@prisma/client';
import { assertSafeToRun, parseArgs } from './lib/safety';

async function main() {
  assertSafeToRun('check-users', parseArgs(), 'Comptage des comptes (lecture seule).');

  const prisma = new PrismaClient();
  try {
    const [total, active, withoutReferralCode, subscribed, byRole] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { referralCode: null } }),
      prisma.user.count({ where: { isSubscribed: true } }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);

    console.log(`[check-users] Comptes : ${total} (actifs : ${active}, en attente d'activation : ${total - active})`);
    console.log(`[check-users] Abonnés : ${subscribed} | sans code de parrainage : ${withoutReferralCode}`);
    for (const row of byRole) {
      console.log(`[check-users] Rôle ${row.role} : ${row._count._all}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[check-users] Échec :', error instanceof Error ? error.message : error);
  process.exit(1);
});
