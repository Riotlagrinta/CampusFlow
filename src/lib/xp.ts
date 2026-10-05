import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkRateLimitDb } from '@/lib/rateLimit';

/*
 * XP, niveaux, série quotidienne (streak) et badges.
 *
 * Deux façons de créditer de l'XP :
 *  - `awardActionXP(userId, action)` : crédit PLAFONNÉ par jour, à utiliser pour toute
 *    action que l'utilisateur peut répéter à volonté (forum, planning, ressources, chat...).
 *  - `addXP(userId, amount)` : crédit brut, sans plafond. Réservé aux cas où l'appelant
 *    garantit lui-même l'unicité (ex. XP d'un quiz réussi pour la première fois).
 */

export const XP_PER_LEVEL = 500;
/** Score (en %) à partir duquel un quiz est considéré comme réussi. */
export const QUIZ_PASS_SCORE = 50;
/** Compte système du tuteur IA du forum : jamais ADMIN, jamais classé, jamais récompensé. */
export const AI_TUTOR_EMAIL = 'ai-tutor@defitech.tg';

export function levelFromXp(xp: number): number {
  return Math.floor(Math.max(xp, 0) / XP_PER_LEVEL) + 1;
}

/**
 * Comptes pris en compte dans le classement (et à réutiliser pour calculer un rang) :
 * ni administrateurs, ni compte IA, ni comptes non activés.
 */
export const leaderboardUserFilter = {
  isActive: true,
  role: { not: 'ADMIN' },
  email: { not: AI_TUTOR_EMAIL },
} satisfies Prisma.UserWhereInput;

/** Champs nécessaires pour décider si un compte est classé et calculer son rang. */
export type RankableUser = {
  id: string;
  xp: number;
  role: string;
  email: string;
  isActive: boolean;
};

/** Vrai si le compte figure dans le classement (donc s'il a un rang). */
export function isRankedUser(user: Pick<RankableUser, 'role' | 'email' | 'isActive'>): boolean {
  return user.isActive && user.role !== 'ADMIN' && user.email !== AI_TUTOR_EMAIL;
}

/**
 * Comptes classés strictement devant `user` : plus d'XP, ou même XP et id plus petit.
 * Même ordre que le classement (`orderBy: [{ xp: 'desc' }, { id: 'asc' }]`), donc le rang
 * d'un utilisateur est toujours sa position dans la liste du classement.
 */
export function usersAheadWhere(user: Pick<RankableUser, 'id' | 'xp'>): Prisma.UserWhereInput {
  return {
    ...leaderboardUserFilter,
    OR: [{ xp: { gt: user.xp } }, { xp: user.xp, id: { lt: user.id } }],
  };
}

/**
 * Rang (à partir de 1) d'un utilisateur dans le classement général, ou `null` s'il n'est pas
 * classé (ADMIN, compte IA, compte non activé). À utiliser partout où un rang est affiché
 * (profil web, tableau de bord, mobile) pour qu'il soit identique partout.
 */
export async function getUserRank(user: RankableUser): Promise<number | null> {
  if (!isRankedUser(user)) return null;
  const ahead = await prisma.user.count({ where: usersAheadWhere(user) });
  return ahead + 1;
}

type Db = PrismaClient | Prisma.TransactionClient;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

// ---------------------------------------------------------------------------
// Plafond quotidien par type d'action
// ---------------------------------------------------------------------------

/**
 * Barème des actions répétables : XP accordé par action et nombre maximal d'actions
 * récompensées par fenêtre glissante de 24 h (donc XP/jour max = xp × perDay).
 * Les actions au-delà du plafond restent possibles, elles ne rapportent simplement plus d'XP.
 *
 * `planning`, `resource` et `ai_chat` sont prévus pour les routes planning/personal,
 * resources et chat, qui créditent encore de l'XP brut sans plafond.
 */
export const XP_ACTIONS = {
  forum_question: { xp: 20, perDay: 3 },
  forum_answer: { xp: 10, perDay: 5 },
  answer_accepted: { xp: 50, perDay: 5 },
  planning: { xp: 10, perDay: 3 },
  resource: { xp: 30, perDay: 3 },
  ai_chat: { xp: 5, perDay: 10 },
} as const satisfies Record<string, { xp: number; perDay: number }>;

export type XpAction = keyof typeof XP_ACTIONS;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AwardedBadge = { slug: string; name: string };

export type AddXpResult = {
  xp: number;
  level: number;
  leveledUp: boolean;
  streak: number | null;
  newBadges: AwardedBadge[];
};

/**
 * Crédite l'XP d'une action répétable en respectant son plafond quotidien.
 *
 *   awardActionXP(userId: string, action: XpAction, ctx?: ProgressContext)
 *     : Promise<{ awarded: boolean; amount: number; progress: AddXpResult | null }>
 *
 *  - `awarded` : false si le plafond du jour est atteint (aucun XP crédité) ou si l'utilisateur
 *    n'existe pas ; `amount` vaut alors 0.
 *  - le compteur vit dans la table RateLimit (clé `xp:<action>:<userId>`), le test + incrément
 *    est atomique : pas de nouveau champ de schéma. Ajouter une action = ajouter une ligne à
 *    XP_ACTIONS.
 *
 * Exemple (lot planning) : `await awardActionXP(user.id, 'planning')` à la place de `addXP(user.id, 10)`.
 */
export async function awardActionXP(
  userId: string,
  action: XpAction,
  ctx: ProgressContext = {}
): Promise<{ awarded: boolean; amount: number; progress: AddXpResult | null }> {
  const { xp, perDay } = XP_ACTIONS[action];

  const slot = await checkRateLimitDb(`xp:${action}:${userId}`, perDay, DAY_MS);
  if (!slot.allowed) return { awarded: false, amount: 0, progress: null };

  const progress = await addXP(userId, xp, ctx);
  return progress
    ? { awarded: true, amount: xp, progress }
    : { awarded: false, amount: 0, progress: null };
}

// ---------------------------------------------------------------------------
// Crédit d'XP et niveau
// ---------------------------------------------------------------------------

/**
 * Incrément atomique de l'XP puis mise à niveau, utilisable dans une transaction
 * (`creditXp(tx, ...)`) pour lier le crédit à une autre écriture. Ne touche ni à la série
 * ni aux badges : voir `syncProgress`. Renvoie null si l'utilisateur n'existe pas.
 *
 * Le niveau est toujours recalculé depuis l'XP renvoyé par la base et ne peut que monter
 * (`level < nouveau`), ce qui reste correct avec des crédits concurrents.
 */
export async function creditXp(db: Db, userId: string, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) return null;

  let updated: { xp: number; level: number };
  try {
    updated = await db.user.update({
      where: { id: userId },
      data: { xp: { increment: amount } },
      select: { xp: true, level: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
    throw e;
  }

  const level = levelFromXp(updated.xp);
  if (level > updated.level) {
    await db.user.updateMany({ where: { id: userId, level: { lt: level } }, data: { level } });
  }

  return {
    xp: updated.xp,
    level: Math.max(level, updated.level),
    leveledUp: level > updated.level,
  };
}

export type ProgressContext = {
  /** Mettre à true après l'enregistrement d'une tentative de quiz (active les badges de quiz). */
  quiz?: boolean;
};

/**
 * Crédit brut (sans plafond) : incrément atomique, série du jour, badges.
 * Ne lève jamais d'erreur à cause de la série ou des badges (non critiques).
 */
export async function addXP(
  userId: string,
  amount: number,
  ctx: ProgressContext = {}
): Promise<AddXpResult | null> {
  const credited = await creditXp(prisma, userId, amount);
  if (!credited) return null;

  const progress = await syncProgress(userId, ctx);
  return { ...credited, ...progress };
}

/**
 * Série du jour + badges, à appeler après un crédit fait via `creditXp` (hors `addXP`).
 */
export async function syncProgress(
  userId: string,
  ctx: ProgressContext = {}
): Promise<{ streak: number | null; newBadges: AwardedBadge[] }> {
  let streak: number | null = null;
  let newBadges: AwardedBadge[] = [];

  try {
    streak = await touchStreak(userId);
  } catch (e) {
    console.error('Erreur mise à jour de la série:', e);
  }

  try {
    newBadges = await checkBadges(userId, { quiz: ctx.quiz, streak });
  } catch (e) {
    console.error('Erreur attribution des badges:', e);
  }

  return { streak, newBadges };
}

// ---------------------------------------------------------------------------
// Série quotidienne (streak) : basée sur User.lastStreakAt (jours UTC)
// ---------------------------------------------------------------------------

const utcDay = (d: Date) => Math.floor(d.getTime() / DAY_MS);

/**
 * Enregistre l'activité du jour : +1 si la dernière activité date d'hier, remise à 1 après
 * une interruption, inchangé si déjà compté aujourd'hui. Idempotent et sûr en concurrence
 * (écriture conditionnelle sur la valeur lue de lastStreakAt). Ne touche pas à lastActive.
 */
export async function touchStreak(userId: string, now: Date = new Date()): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streak: true, lastStreakAt: true },
  });
  if (!user) return null;

  const today = utcDay(now);
  const last = user.lastStreakAt ? utcDay(user.lastStreakAt) : null;
  if (last !== null && last >= today) return user.streak;

  const next = last !== null && today - last === 1 ? Math.max(user.streak, 0) + 1 : 1;

  const res = await prisma.user.updateMany({
    where: { id: userId, lastStreakAt: user.lastStreakAt },
    data: { streak: next, lastStreakAt: now },
  });
  if (res.count === 1) return next;

  // Un appel concurrent a déjà compté ce jour : on relit la valeur.
  const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { streak: true } });
  return fresh?.streak ?? null;
}

/**
 * Série à afficher : une série non prolongée depuis plus d'un jour est déjà rompue,
 * même si la base n'a pas encore été remise à jour (elle l'est au prochain retour).
 */
export function effectiveStreak(streak: number, lastStreakAt: Date | null, now: Date = new Date()): number {
  if (!lastStreakAt) return 0;
  return utcDay(now) - utcDay(lastStreakAt) > 1 ? 0 : streak;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const BADGES = {
  'first-step': {
    name: 'Premiers Pas',
    description: 'A gagné ses premiers points d\'XP.',
    icon: 'Flag',
    xpCost: 0,
  },
  'quiz-master': {
    name: 'Maître des Quizz',
    description: 'A réussi 10 quizz différents.',
    icon: 'Trophy',
    xpCost: 0,
  },
  'subject-expert': {
    name: 'Expert du Sujet',
    description: 'A réussi 3 quizz à plus de 80 % dans une même matière.',
    icon: 'Award',
    xpCost: 0,
  },
  'streak-7': {
    name: 'Série de Fer',
    description: 'A été actif 7 jours de suite.',
    icon: 'Flame',
    xpCost: 0,
  },
} as const;

type BadgeSlug = keyof typeof BADGES;

async function checkBadges(
  userId: string,
  ctx: { quiz?: boolean; streak: number | null }
): Promise<AwardedBadge[]> {
  const owned = new Set(
    (
      await prisma.userBadge.findMany({
        where: { userId },
        select: { badge: { select: { slug: true } } },
      })
    ).map(b => b.badge.slug)
  );

  const awarded: AwardedBadge[] = [];
  const grant = async (slug: BadgeSlug) => {
    if (owned.has(slug)) return;
    const badge = await awardBadge(userId, slug);
    if (badge) awarded.push(badge);
  };

  await grant('first-step');

  if (ctx.streak !== null && ctx.streak >= 7) await grant('streak-7');

  if (ctx.quiz && (!owned.has('quiz-master') || !owned.has('subject-expert'))) {
    // Meilleur score par quiz réussi : une seule ligne par quiz, quel que soit le nombre de tentatives.
    const passed = await prisma.quizAttempt.groupBy({
      by: ['quizId'],
      where: { userId, score: { gte: QUIZ_PASS_SCORE } },
      _max: { score: true },
    });

    if (passed.length >= 10) await grant('quiz-master');

    const excellent = passed.filter(p => (p._max.score ?? 0) >= 80).map(p => p.quizId);
    if (excellent.length >= 3) {
      const quizzes = await prisma.quiz.findMany({
        where: { id: { in: excellent }, subjectId: { not: null } },
        select: { subjectId: true },
      });
      const perSubject = new Map<string, number>();
      for (const q of quizzes) {
        if (q.subjectId) perSubject.set(q.subjectId, (perSubject.get(q.subjectId) ?? 0) + 1);
      }
      if ([...perSubject.values()].some(n => n >= 3)) await grant('subject-expert');
    }
  }

  return awarded;
}

/**
 * Attribue un badge, en le créant au besoin (les slugs ne sont pas tous dans le seed).
 * Idempotent : renvoie null si l'utilisateur le possède déjà.
 */
async function awardBadge(userId: string, slug: BadgeSlug): Promise<AwardedBadge | null> {
  let badge: { id: string; name: string } | null;
  try {
    badge = await prisma.badge.upsert({
      where: { slug },
      update: {},
      create: { slug, ...BADGES[slug] },
      select: { id: true, name: true },
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    badge = await prisma.badge.findUnique({ where: { slug }, select: { id: true, name: true } });
  }
  if (!badge) return null;

  try {
    await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
    return { slug, name: badge.name };
  } catch (e) {
    if (isUniqueViolation(e)) return null;
    throw e;
  }
}
