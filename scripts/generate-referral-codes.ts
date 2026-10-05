/**
 * Génère un code de parrainage pour les comptes qui n'en ont pas (comptes antérieurs à la fonctionnalité).
 * Même format que l'inscription : 3 lettres du prénom + "-" + 8 caractères hexadécimaux.
 *
 *   npx tsx scripts/generate-referral-codes.ts --yes
 *
 * Refusé avec NODE_ENV=production. N'affiche que des compteurs.
 */
import { randomBytes } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { assertSafeToRun, parseArgs } from './lib/safety';

const MAX_ATTEMPTS = 5;

function buildReferralCode(firstName: string | null): string {
  const prefix = (firstName ?? '')
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .substring(0, 3)
    .toUpperCase();
  return `${prefix || 'DEFI'}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function main() {
  assertSafeToRun('generate-referral-codes', parseArgs(), 'Génération des codes de parrainage manquants.');

  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { referralCode: null },
      select: { id: true, firstName: true },
    });

    let generated = 0;
    let failed = 0;

    for (const user of users) {
      let done = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt++) {
        try {
          // `referralCode: null` dans le where : on n'écrase jamais un code posé entre-temps.
          const result = await prisma.user.updateMany({
            where: { id: user.id, referralCode: null },
            data: { referralCode: buildReferralCode(user.firstName) },
          });
          if (result.count === 1) generated++;
          done = true;
        } catch (error) {
          // P2002 : collision sur la contrainte d'unicité, on retente avec un autre code.
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        }
      }
      if (!done) failed++;
    }

    console.log(`[generate-referral-codes] ${generated} code(s) généré(s) sur ${users.length} compte(s) concerné(s).`);
    if (failed > 0) {
      console.warn(`[generate-referral-codes] ${failed} compte(s) sans code après ${MAX_ATTEMPTS} tentatives : relancez le script.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[generate-referral-codes] Échec :', error instanceof Error ? error.message : error);
  process.exit(1);
});
