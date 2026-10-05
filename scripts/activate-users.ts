/**
 * Active manuellement des comptes dont l'OTP n'a pas pu être livré (support).
 * Il faut OBLIGATOIREMENT lister les emails à activer : aucune activation en masse.
 *
 *   npx tsx scripts/activate-users.ts --yes eleve1@exemple.com eleve2@exemple.com
 *
 * Refusé avec NODE_ENV=production. N'affiche que des compteurs et des emails masqués.
 */
import { PrismaClient } from '@prisma/client';
import { assertSafeToRun, maskEmail, parseArgs } from './lib/safety';

const MAX_EMAILS = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const args = parseArgs();
  const emails = [
    ...new Set(
      args.positional
        .flatMap((value) => value.split(','))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  if (emails.length === 0) {
    console.error('[activate-users] Aucun email fourni. Usage : npx tsx scripts/activate-users.ts --yes <email> [<email> ...]');
    process.exit(1);
  }
  const invalid = emails.filter((email) => !EMAIL_PATTERN.test(email));
  if (invalid.length > 0) {
    console.error(`[activate-users] ${invalid.length} adresse(s) invalide(s) : ${invalid.map(maskEmail).join(', ')}`);
    process.exit(1);
  }
  if (emails.length > MAX_EMAILS) {
    console.error(`[activate-users] Trop d'adresses (${emails.length} > ${MAX_EMAILS}). Scindez la liste.`);
    process.exit(1);
  }

  assertSafeToRun('activate-users', args, `Activation de ${emails.length} compte(s) listé(s).`);

  const prisma = new PrismaClient();
  try {
    const result = await prisma.user.updateMany({
      where: {
        isActive: false,
        OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
      },
      data: { isActive: true },
    });

    const matching = await prisma.user.findMany({
      where: { OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })) },
      select: { email: true },
    });
    const found = new Set(matching.map((user) => user.email.toLowerCase()));
    const unknown = emails.filter((email) => !found.has(email));

    console.log(`[activate-users] ${result.count} compte(s) activé(s) sur ${emails.length} demandé(s).`);
    console.log(`[activate-users] ${matching.length - result.count} déjà actif(s).`);
    if (unknown.length > 0) {
      console.warn(`[activate-users] ${unknown.length} adresse(s) introuvable(s) : ${unknown.map(maskEmail).join(', ')}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[activate-users] Échec :', error instanceof Error ? error.message : error);
  process.exit(1);
});
