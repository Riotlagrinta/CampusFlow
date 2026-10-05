import { timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const store = new Map<string, number[]>();

export function getRateLimitKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwarded ? forwarded.split(',')[0].trim() : (realIp || 'unknown');
  const ua = req.headers.get('user-agent') || 'unknown';
  return `${ip}::${ua.substring(0, 40)}`;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const timestamps = (store.get(key) || []).filter(t => now - t < windowMs);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    return { allowed: false, retryAfterMs: windowMs - (now - oldest) };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Rate limiting persistant (partagé entre toutes les instances serverless).
 * Chaque étape est une écriture conditionnelle atomique : pas de lire-tester-écrire.
 * Si la base est indisponible, on se rabat sur le compteur en mémoire.
 */
export async function checkRateLimitDb(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  try {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    // 1. Première requête de la fenêtre : création de la ligne.
    try {
      await prisma.rateLimit.create({ data: { key, count: 1, resetAt } });
      return { allowed: true, retryAfterMs: 0 };
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
    }

    // 2. Fenêtre expirée : on repart de 1.
    const reset = await prisma.rateLimit.updateMany({
      where: { key, resetAt: { lte: now } },
      data: { count: 1, resetAt },
    });
    if (reset.count === 1) return { allowed: true, retryAfterMs: 0 };

    // 3. Fenêtre en cours : incrément seulement si la limite n'est pas atteinte.
    const bumped = await prisma.rateLimit.updateMany({
      where: { key, resetAt: { gt: now }, count: { lt: limit } },
      data: { count: { increment: 1 } },
    });
    if (bumped.count === 1) return { allowed: true, retryAfterMs: 0 };

    const row = await prisma.rateLimit.findUnique({ where: { key }, select: { resetAt: true } });
    const retryAfterMs = row ? Math.max(row.resetAt.getTime() - now.getTime(), 0) : windowMs;

    // Ménage occasionnel des lignes expirées.
    if (Math.random() < 0.01) {
      await prisma.rateLimit.deleteMany({ where: { resetAt: { lte: now } } }).catch(() => {});
    }

    return { allowed: false, retryAfterMs };
  } catch {
    return checkRateLimit(key, limit, windowMs);
  }
}

// Comparaison en temps constant pour éviter les timing attacks sur les codes OTP/reset
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Comparer la taille en octets : deux chaînes de même longueur peuvent différer en octets
  // (ex. 'é' / 'e') et timingSafeEqual lèverait alors une RangeError.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
