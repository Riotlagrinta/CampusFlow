import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { QUIZ_PASS_SCORE, creditXp, syncProgress } from '@/lib/xp';
import { getScopeProfile, quizScopeWhere } from '@/lib/academicScope';
import { getCurrentSemester, pageArgs, splitPage } from '@/lib/contentListing';
import { checkRateLimitDb, getRateLimitKey } from '@/lib/rateLimit';

const HOUR_MS = 60 * 60 * 1000;

const listSchema = z.object({
  // Sans paramètre : semestre en cours (calendrier, voir @/lib/semester).
  semester: z.coerce.number().int().min(1).max(12).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.string().max(64).optional(),
});

const submitSchema = z.object({
  quizId: z.string().min(1).max(64),
  // Une réponse (index de l'option choisie) par question, dans l'ordre renvoyé par GET /api/quiz/[id].
  answers: z.array(z.number().int().min(0).max(99)).min(1).max(200),
});

// Identifiant déterministe de la tentative qui porte la récompense XP d'un (utilisateur, quiz) :
// la clé primaire garantit qu'une seule tentative par quiz et par utilisateur peut la créer,
// même si plusieurs soumissions arrivent en même temps.
const rewardAttemptId = (userId: string, quizId: string) => `qxp:${userId}:${quizId}`;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const parsed = listSchema.safeParse({
      semester: searchParams.get('semester') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' }, { status: 400 });
    }
    const { limit, cursor } = parsed.data;
    const semester = parsed.data.semester ?? getCurrentSemester();

    const profile = await getScopeProfile(authUser);
    if (!profile) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const rows = await prisma.quiz.findMany({
      where: await quizScopeWhere(profile, semester),
      ...pageArgs({ limit, cursor }),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        subjectName: true,
        subjectId: true,
        xpReward: true,
        resourceId: true,
        createdAt: true,
        subject: { select: { id: true, name: true, code: true, semester: true } },
        _count: { select: { questions: true } },
      },
    });

    // Page + curseur de la suivante (en-tête X-Next-Cursor, absent sur la dernière page).
    const { page: quizzes, headers } = splitPage(rows, limit);

    // Progression de l'utilisateur : meilleur score et XP déjà obtenus par quiz.
    const progress = quizzes.length
      ? await prisma.quizAttempt.groupBy({
          by: ['quizId'],
          where: { userId: authUser.id, quizId: { in: quizzes.map(q => q.id) } },
          _max: { score: true },
          _sum: { xpGained: true },
        })
      : [];
    const byQuiz = new Map(progress.map(p => [p.quizId, p]));

    return NextResponse.json(
      quizzes.map(q => {
        const p = byQuiz.get(q.id);
        return {
          ...q,
          myBestScore: p?._max.score ?? null,
          xpEarned: p?._sum.xpGained ?? 0,
        };
      }),
      { headers }
    );
  } catch (error) {
    console.error('Erreur Quiz GET:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const [byUser, byIp] = await Promise.all([
      checkRateLimitDb(`quiz-submit:user:${authUser.id}`, 60, HOUR_MS),
      checkRateLimitDb(`quiz-submit:ip:${getRateLimitKey(req)}`, 200, HOUR_MS),
    ]);
    if (!byUser.allowed || !byIp.allowed) {
      const retryAfter = Math.ceil(Math.max(byUser.retryAfterMs, byIp.retryAfterMs) / 1000);
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    const { quizId, answers } = parsed.data;

    const profile = await getScopeProfile(authUser);
    if (!profile) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    // Quiz hors de la filière/niveau de l'utilisateur : traité comme inexistant.
    const quiz = await prisma.quiz.findFirst({
      where: { AND: [{ id: quizId }, await quizScopeWhere(profile)] },
      select: {
        id: true,
        xpReward: true,
        // Même ordre que GET /api/quiz/[id] : la correction se fait par position.
        questions: { orderBy: { id: 'asc' }, select: { answer: true } },
      },
    });
    if (!quiz) return NextResponse.json({ error: 'Quiz introuvable' }, { status: 404 });

    const total = quiz.questions.length;
    if (total === 0) {
      return NextResponse.json({ error: 'Ce quiz ne contient aucune question' }, { status: 400 });
    }
    if (answers.length !== total) {
      return NextResponse.json({ error: 'Nombre de réponses invalide' }, { status: 400 });
    }

    // Score calculé côté serveur uniquement.
    const correctCount = quiz.questions.reduce((n, q, i) => (answers[i] === q.answer ? n + 1 : n), 0);
    const score = Math.round((correctCount / total) * 100);
    const passed = score >= QUIZ_PASS_SCORE;
    const reward = passed ? Math.round((quiz.xpReward * score) / 100) : 0;

    // XP uniquement à la première réussite de ce quiz par cet utilisateur.
    let attempt: { id: string; score: number; xpGained: number; createdAt: Date } | null = null;
    let credited: Awaited<ReturnType<typeof creditXp>> = null;
    let alreadyRewarded = false;

    if (reward > 0) {
      const previous = await prisma.quizAttempt.findFirst({
        where: { userId: authUser.id, quizId, xpGained: { gt: 0 } },
        select: { id: true },
      });
      alreadyRewarded = previous !== null;

      if (!alreadyRewarded) {
        try {
          // Tentative récompensée + crédit d'XP : tout ou rien.
          const result = await prisma.$transaction(async tx => {
            const created = await tx.quizAttempt.create({
              data: { id: rewardAttemptId(authUser.id, quizId), userId: authUser.id, quizId, score, xpGained: reward },
              select: { id: true, score: true, xpGained: true, createdAt: true },
            });
            return { created, credited: await creditXp(tx, authUser.id, reward) };
          });
          attempt = result.created;
          credited = result.credited;
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
          alreadyRewarded = true; // Une soumission simultanée a obtenu la récompense avant nous.
        }
      }
    }

    if (!attempt) {
      attempt = await prisma.quizAttempt.create({
        data: { userId: authUser.id, quizId, score, xpGained: 0 },
        select: { id: true, score: true, xpGained: true, createdAt: true },
      });
    }

    // Série du jour et badges (quiz-master, subject-expert...) : non bloquant.
    const progress = await syncProgress(authUser.id, { quiz: true });

    return NextResponse.json({
      success: true,
      attempt,
      score,
      correctCount,
      total,
      passed,
      passScore: QUIZ_PASS_SCORE,
      xpGained: attempt.xpGained,
      alreadyRewarded,
      leveledUp: credited?.leveledUp ?? false,
      level: credited?.level ?? null,
      streak: progress.streak,
      newBadges: progress.newBadges,
    });
  } catch (error) {
    console.error('Erreur Quiz POST:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
