import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { getScopeProfile, quizScopeWhere } from '@/lib/academicScope';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { id } = await params;

    const profile = await getScopeProfile(authUser);
    if (!profile) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    // SÉCURITÉ : on ne sélectionne jamais le champ `answer` (bonne réponse) — la correction
    // se fait côté serveur dans POST /api/quiz, qui renvoie le résultat.
    // L'ordre des questions (id croissant) est le même que celui utilisé pour la correction.
    const quiz = await prisma.quiz.findFirst({
      where: { AND: [{ id }, await quizScopeWhere(profile)] },
      select: {
        id: true,
        title: true,
        description: true,
        subjectName: true,
        subjectId: true,
        xpReward: true,
        resourceId: true,
        subject: { select: { id: true, name: true, code: true, semester: true } },
        questions: {
          orderBy: { id: 'asc' },
          select: { id: true, question: true, options: true },
        },
      },
    });

    if (!quiz) return NextResponse.json({ error: 'Quiz introuvable' }, { status: 404 });

    const history = await prisma.quizAttempt.aggregate({
      where: { userId: authUser.id, quizId: quiz.id },
      _max: { score: true },
      _sum: { xpGained: true },
    });

    return NextResponse.json({
      ...quiz,
      myBestScore: history._max.score ?? null,
      xpEarned: history._sum.xpGained ?? 0,
    });
  } catch (error) {
    console.error('Erreur Quiz GET detail:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
