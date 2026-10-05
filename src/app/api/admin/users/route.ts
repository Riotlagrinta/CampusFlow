import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { quotaDay } from '@/lib/quota';

// Compte système qui reçoit les contenus des comptes supprimés (voir users/[id]/route.ts,
// garder la même valeur). Il n'est pas un étudiant : on le masque de la liste.
const DELETED_USER_EMAIL = 'compte-supprime@studenthub.invalid';

const DEFAULT_TAKE = 100;
const MAX_TAKE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const querySchema = z.object({
  take: z.coerce
    .number({ error: `Paramètre take invalide (1 à ${MAX_TAKE})` })
    .int(`Paramètre take invalide (1 à ${MAX_TAKE})`)
    .min(1, `Paramètre take invalide (1 à ${MAX_TAKE})`)
    .max(MAX_TAKE, `Paramètre take invalide (1 à ${MAX_TAKE})`)
    .default(DEFAULT_TAKE),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Paramètre cursor invalide').optional(),
});

// Champs renvoyés pour chaque utilisateur : liste explicite, jamais de password, otpCode,
// resetCode, pushToken ni compteurs de sécurité.
const adminUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  isSubscribed: true,
  subscriptionExpiresAt: true,
  xp: true,
  level: true,
  lastActive: true,
  referralCode: true,
  referredById: true,
  fieldId: true,
  academicLevelId: true,
  field: { select: { name: true, code: true } },
  academicLevel: { select: { name: true } },
  _count: { select: { referrals: true } },
} as const;

/**
 * Console admin : liste des utilisateurs (la plus récemment active d'abord) + statistiques.
 * Le corps garde sa forme `{ users, totalUsers, totalTokensToday, totalRevenue, chartData }`.
 *  - GET ?take=100&cursor=<id> : `take` est borné à 100. Le curseur de la page suivante est
 *    dans `nextCursor` (et dans l'en-tête `X-Next-Cursor`), `null` sur la dernière page.
 */
export async function GET(req: Request) {
  try {
    const admin = await getAuthUser(req);
    if (!admin) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (admin.role !== 'ADMIN') return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });

    const searchParams = new URL(req.url).searchParams;
    const parsed = querySchema.safeParse({
      take: searchParams.get('take') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' }, { status: 400 });
    }
    const { take, cursor } = parsed.data;

    const notSystemAccount = { email: { not: DELETED_USER_EMAIL } };

    const today = quotaDay();
    const weekStart = new Date(today.getTime() - 6 * DAY_MS);

    const [rows, totalUsers, revenue, tokensToday, weeklyUsages] = await Promise.all([
      prisma.user.findMany({
        where: notSystemAccount,
        select: adminUserSelect,
        orderBy: [{ lastActive: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor } } : {}),
      }),
      prisma.user.count({ where: notSystemAccount }),
      prisma.transaction.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
      prisma.dailyAIUsage.aggregate({ where: { date: today }, _sum: { tokensUsed: true } }),
      // Statistiques des 7 derniers jours pour les graphiques
      prisma.dailyAIUsage.groupBy({
        by: ['date'],
        where: { date: { gte: weekStart } },
        _sum: { tokensUsed: true, requestCount: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const hasMore = rows.length > take;
    const users = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? rows[take].id : null;

    const chartData = weeklyUsages.map((usage) => ({
      day: usage.date.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }),
      tokens: usage._sum.tokensUsed ?? 0,
      requests: usage._sum.requestCount ?? 0,
    }));

    return NextResponse.json(
      {
        users,
        nextCursor,
        totalUsers,
        totalTokensToday: tokensToday._sum.tokensUsed ?? 0,
        totalRevenue: revenue._sum.amount ?? 0,
        chartData,
      },
      {
        headers: {
          'Access-Control-Expose-Headers': 'X-Next-Cursor',
          ...(nextCursor ? { 'X-Next-Cursor': nextCursor } : {}),
        },
      }
    );
  } catch (error) {
    console.error('Erreur liste utilisateurs admin:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
