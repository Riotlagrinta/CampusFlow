import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimitDb } from "@/lib/rateLimit";
import { isPaymentsEnabled } from "@/lib/payments";

/**
 * Quota IA quotidien : source unique de vérité pour chat, flashcards, quiz et explication.
 *
 * Modèle :
 *  - chaque utilisateur dispose de AI_DAILY_LIMIT requêtes gratuites par jour (UTC) ;
 *  - au-delà, chaque requête consomme 1 jeton bonus (User.aiBonusRequests, achetés ou gagnés par pub) ;
 *  - `DailyAIUsage.requestCount` ne compte que les requêtes GRATUITES (0..AI_DAILY_LIMIT) ;
 *    les requêtes payées en bonus sont visibles via la baisse du solde de jetons ;
 *  - `DailyAIUsage.quizRequestCount` compte en plus les générations de quiz (statistique).
 *
 * Usage dans une route :
 *   const quota = await consumeAiRequest(user.id, "chat");
 *   if (!quota.ok) return quotaExceededResponse();
 *   try { ...appel LLM... } catch { await refundAiRequest(quota.ticket); ... }
 *
 * La consommation est atomique (UPDATE conditionnel) : 20 requêtes parallèles ne peuvent pas
 * dépasser la limite. Elle se fait AVANT l'appel LLM ; en cas d'échec ou de résultat vide,
 * la route doit appeler refundAiRequest (idempotent, ne lève jamais d'exception).
 */

/** Requêtes IA gratuites par jour et par utilisateur. */
export const AI_DAILY_LIMIT = 10;

/** Pub-récompense : jetons par pub, plafond quotidien et délai minimal entre deux récompenses. */
export const AD_REWARD_TOKENS = 2;
export const AD_REWARD_DAILY_MAX = 5;
export const AD_REWARD_MIN_DELAY_MS = 30_000;

export type AiUsageKind = "chat" | "flashcards" | "quiz" | "explain";

export interface AiQuota {
  /** Requêtes gratuites déjà utilisées aujourd'hui (0..limit). */
  used: number;
  /** Requêtes gratuites par jour (AI_DAILY_LIMIT). */
  limit: number;
  /** Jetons bonus disponibles. */
  bonus: number;
  /** Requêtes encore possibles : (limit - used) + bonus. */
  remaining: number;
}

/** Reçu d'une consommation, à passer à refundAiRequest / recordAiTokens. */
export interface AiTicket {
  readonly userId: string;
  readonly day: Date;
  readonly kind: AiUsageKind;
  readonly source: "free" | "bonus";
  refunded: boolean;
}

export type ConsumeResult =
  | { ok: true; ticket: AiTicket }
  | { ok: false; reason: "quota_exceeded" };

/** Jour de quota : minuit UTC (même clé quel que soit le fuseau du serveur). */
export function quotaDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Clé de jour 'YYYY-MM-DD' (UTC), utilisée pour le plafond des pubs-récompense. */
export function quotaDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Quota courant d'un utilisateur ; même formule pour toutes les routes. */
export async function getAiQuota(userId: string): Promise<AiQuota> {
  const [usage, user] = await Promise.all([
    prisma.dailyAIUsage.findUnique({
      where: { userId_date: { userId, date: quotaDay() } },
      select: { requestCount: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { aiBonusRequests: true } }),
  ]);

  const used = Math.min(Math.max(usage?.requestCount ?? 0, 0), AI_DAILY_LIMIT);
  const bonus = Math.max(user?.aiBonusRequests ?? 0, 0);
  return { used, limit: AI_DAILY_LIMIT, bonus, remaining: AI_DAILY_LIMIT - used + bonus };
}

/**
 * Consomme atomiquement 1 requête IA (gratuite d'abord, puis bonus).
 * À appeler AVANT l'appel LLM.
 */
export async function consumeAiRequest(userId: string, kind: AiUsageKind): Promise<ConsumeResult> {
  const day = quotaDay();
  const isQuiz = kind === "quiz";

  const takeFree = () =>
    prisma.dailyAIUsage.updateMany({
      where: { userId, date: day, requestCount: { lt: AI_DAILY_LIMIT } },
      data: {
        requestCount: { increment: 1 },
        ...(isQuiz ? { quizRequestCount: { increment: 1 } } : {}),
      },
    });

  const ticket = (source: AiTicket["source"]): ConsumeResult => ({
    ok: true,
    ticket: { userId, day, kind, source, refunded: false },
  });

  // 1. Requête gratuite : UPDATE conditionnel (count = 1 si la limite n'est pas atteinte).
  let free = await takeFree();
  if (free.count === 0) {
    // La ligne du jour n'existe peut-être pas encore (première requête de la journée).
    await prisma.dailyAIUsage.createMany({ data: [{ userId, date: day }], skipDuplicates: true });
    free = await takeFree();
  }
  if (free.count === 1) return ticket("free");

  // 2. Limite gratuite atteinte : jeton bonus, décrément conditionnel (jamais en dessous de 0).
  const bonus = await prisma.user.updateMany({
    where: { id: userId, aiBonusRequests: { gt: 0 } },
    data: { aiBonusRequests: { decrement: 1 } },
  });
  if (bonus.count !== 1) return { ok: false, reason: "quota_exceeded" };

  if (isQuiz) {
    // Simple statistique : l'atomicité du quota repose sur le décrément conditionnel ci-dessus.
    await prisma.dailyAIUsage
      .updateMany({ where: { userId, date: day }, data: { quizRequestCount: { increment: 1 } } })
      .catch(() => undefined);
  }
  return ticket("bonus");
}

/**
 * Rend la requête consommée (échec du LLM, résultat vide, document illisible...).
 * Idempotent par ticket, ne lève jamais d'exception.
 */
export async function refundAiRequest(ticket: AiTicket): Promise<void> {
  if (ticket.refunded) return;
  ticket.refunded = true;

  const isQuiz = ticket.kind === "quiz";
  try {
    if (ticket.source === "free") {
      await prisma.dailyAIUsage.updateMany({
        where: {
          userId: ticket.userId,
          date: ticket.day,
          requestCount: { gt: 0 },
          ...(isQuiz ? { quizRequestCount: { gt: 0 } } : {}),
        },
        data: {
          requestCount: { decrement: 1 },
          ...(isQuiz ? { quizRequestCount: { decrement: 1 } } : {}),
        },
      });
    } else {
      await prisma.user.update({
        where: { id: ticket.userId },
        data: { aiBonusRequests: { increment: 1 } },
      });
      if (isQuiz) {
        await prisma.dailyAIUsage.updateMany({
          where: { userId: ticket.userId, date: ticket.day, quizRequestCount: { gt: 0 } },
          data: { quizRequestCount: { decrement: 1 } },
        });
      }
    }
  } catch (error) {
    console.error("[quota] remboursement impossible:", error instanceof Error ? error.message : "erreur inconnue");
  }
}

/** Statistique : tokens LLM consommés aujourd'hui. Best effort, n'échoue jamais. */
export async function recordAiTokens(ticket: AiTicket, tokens: number | null | undefined): Promise<void> {
  if (!tokens || tokens <= 0) return;
  try {
    await prisma.dailyAIUsage.updateMany({
      where: { userId: ticket.userId, date: ticket.day },
      data: { tokensUsed: { increment: Math.round(tokens) } },
    });
  } catch {
    // statistique uniquement
  }
}

export function quotaExceededResponse(): NextResponse {
  return NextResponse.json(
    {
      // Paiements désactivés (freemium) : aucun renvoi vers la boutique.
      error: isPaymentsEnabled()
        ? `Quota IA épuisé : ${AI_DAILY_LIMIT} requêtes gratuites par jour et plus aucun jeton bonus. Regardez une publicité ou rechargez vos jetons dans la boutique.`
        : `Quota IA épuisé : ${AI_DAILY_LIMIT} requêtes gratuites par jour et plus aucun jeton bonus. Le quota est renouvelé chaque jour : réessayez demain ou regardez une publicité pour gagner des jetons.`,
      quotaExceeded: true,
    },
    { status: 429 }
  );
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip");
  return ip || "unknown";
}

export function rateLimitedResponse(retryAfterMs: number): NextResponse {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json(
    { error: `Trop de requêtes. Réessayez dans ${retryAfterSec} s.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

/**
 * Limite de débit persistante (par utilisateur ET par IP) pour les routes IA/pub.
 * Retourne null si la requête est autorisée, sinon la réponse 429 à renvoyer.
 */
export async function enforceRateLimit(
  req: Request,
  userId: string,
  scope: string,
  opts: { perUser?: number; perIp?: number; windowMs?: number } = {}
): Promise<NextResponse | null> {
  const { perUser = 20, perIp = 60, windowMs = 60_000 } = opts;

  const byUser = await checkRateLimitDb(`${scope}:user:${userId}`, perUser, windowMs);
  if (!byUser.allowed) return rateLimitedResponse(byUser.retryAfterMs);

  const byIp = await checkRateLimitDb(`${scope}:ip:${getClientIp(req)}`, perIp, windowMs);
  if (!byIp.allowed) return rateLimitedResponse(byIp.retryAfterMs);

  return null;
}
