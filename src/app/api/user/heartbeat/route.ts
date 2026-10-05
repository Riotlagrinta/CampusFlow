import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { checkRateLimit } from '@/lib/rateLimit';
import { touchStreak } from '@/lib/xp';

const MIN_INTERVAL_MS = 60 * 1000;

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    // Le client envoie un signal toutes les 2 minutes : on borne les appels abusifs.
    const limit = checkRateLimit(`heartbeat:${authUser.id}`, 10, MIN_INTERVAL_MS);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    // Présence : lastActive n'est réécrit qu'une fois par minute au plus.
    const now = new Date();
    await prisma.user.updateMany({
      where: { id: authUser.id, lastActive: { lt: new Date(now.getTime() - MIN_INTERVAL_MS) } },
      data: { lastActive: now },
    });

    // La série quotidienne a son propre champ (lastStreakAt) : la présence ne l'écrase pas.
    let streak: number | null = null;
    try {
      streak = await touchStreak(authUser.id, now);
    } catch (e) {
      console.error('Erreur série (heartbeat):', e);
    }

    return NextResponse.json({ success: true, streak });
  } catch (error) {
    console.error('Erreur Heartbeat:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
