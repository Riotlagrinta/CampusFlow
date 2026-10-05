import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import {
  AD_REWARD_DAILY_MAX,
  AD_REWARD_MIN_DELAY_MS,
  AD_REWARD_TOKENS,
  enforceRateLimit,
  quotaDayKey,
} from '@/lib/quota';

/**
 * Récompense « publicité regardée » : +AD_REWARD_TOKENS jetons IA.
 *
 * Le serveur ne peut PAS prouver qu'une publicité a réellement été vue (il faudrait un callback
 * serveur-à-serveur du réseau publicitaire). Il impose donc seulement des limites strictes :
 *  - au plus AD_REWARD_DAILY_MAX récompenses par jour (UTC) ;
 *  - au moins AD_REWARD_MIN_DELAY_MS entre deux récompenses ;
 *  - le test et l'écriture sont un seul UPDATE conditionnel : des requêtes parallèles ne
 *    peuvent pas créditer plus d'une fois.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const limited = await enforceRateLimit(req, user.id, 'ad-reward', {
      perUser: 12,
      perIp: 40,
      windowMs: 10 * 60_000,
    });
    if (limited) return limited;

    const now = new Date();
    const day = quotaDayKey(now);
    const delayElapsed = [
      { lastAdRewardAt: null },
      { lastAdRewardAt: { lte: new Date(now.getTime() - AD_REWARD_MIN_DELAY_MS) } },
    ];
    const reward = {
      aiBonusRequests: { increment: AD_REWARD_TOKENS },
      lastAdRewardAt: now,
    };

    // 1. Même journée : compteur incrémenté tant que le plafond n'est pas atteint.
    let granted = await prisma.user.updateMany({
      where: { id: user.id, adRewardDay: day, adRewardCount: { lt: AD_REWARD_DAILY_MAX }, OR: delayElapsed },
      data: { ...reward, adRewardCount: { increment: 1 } },
    });

    // 2. Première récompense de la journée : le compteur repart à 1.
    if (granted.count === 0) {
      granted = await prisma.user.updateMany({
        where: {
          id: user.id,
          AND: [{ OR: [{ adRewardDay: null }, { adRewardDay: { not: day } }] }, { OR: delayElapsed }],
        },
        data: { ...reward, adRewardDay: day, adRewardCount: 1 },
      });
    }

    const state = await prisma.user.findUnique({
      where: { id: user.id },
      select: { aiBonusRequests: true, adRewardDay: true, adRewardCount: true, lastAdRewardAt: true },
    });
    if (!state) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    if (granted.count === 1) {
      return NextResponse.json({
        success: true,
        reward: AD_REWARD_TOKENS,
        message: `+${AD_REWARD_TOKENS} jetons ajoutés !`,
        bonus: state.aiBonusRequests,
        remainingToday: Math.max(AD_REWARD_DAILY_MAX - state.adRewardCount, 0),
      });
    }

    // Refus : plafond du jour atteint, ou délai minimal pas encore écoulé.
    if (state.adRewardDay === day && state.adRewardCount >= AD_REWARD_DAILY_MAX) {
      return NextResponse.json(
        { error: `Limite atteinte : ${AD_REWARD_DAILY_MAX} récompenses par jour. Revenez demain !` },
        { status: 429 }
      );
    }

    const waitMs = state.lastAdRewardAt
      ? state.lastAdRewardAt.getTime() + AD_REWARD_MIN_DELAY_MS - now.getTime()
      : AD_REWARD_MIN_DELAY_MS;
    const waitSec = Math.max(1, Math.ceil(waitMs / 1000));
    return NextResponse.json(
      { error: `Patientez ${waitSec} s avant la prochaine récompense.` },
      { status: 429, headers: { 'Retry-After': String(waitSec) } }
    );
  } catch (error) {
    console.error('[ad-reward] erreur:', error instanceof Error ? error.name : 'erreur inconnue');
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
