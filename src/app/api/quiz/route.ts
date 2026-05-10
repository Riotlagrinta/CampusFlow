import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const semester = parseInt(searchParams.get('semester') || '1');

    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { fieldId: true, academicLevelId: true, role: true }
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let fieldFilter: string | { in: string[] } | null = user.fieldId;

    if (user.fieldId && user.role !== 'ADMIN') {
      const userField = await prisma.field.findUnique({ where: { id: user.fieldId } });
      if (userField?.code === 'GL' || userField?.code === 'RIT') {
        const sharedFields = await prisma.field.findMany({
          where: { code: { in: ['GL', 'RIT'] } },
          select: { id: true }
        });
        fieldFilter = { in: sharedFields.map(f => f.id) };
      }
    }

    const quizzes = await prisma.quiz.findMany({
      where: {
        OR: [
          { subjectId: null },
          {
            subject: {
              semester,
              ...(user.role === 'ADMIN' ? {} : {
                fieldId: fieldFilter ?? undefined,
                levelId: user.academicLevelId ?? undefined
              })
            }
          }
        ]
      },
      include: { _count: { select: { questions: true } }, subject: true }
    });
    return NextResponse.json(quizzes);
  } catch (error) {
    console.error('Erreur Quiz GET:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // HIGH FIX: le score était envoyé par le client — on recalcule désormais
    // le score côté serveur en vérifiant chaque réponse.
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { quizId, answers } = await req.json();

    if (!quizId || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true }
    });

    if (!user || !quiz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Calcul du score côté serveur
    let correctCount = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      if (answers[i] === quiz.questions[i].answer) correctCount++;
    }
    const score = Math.round((correctCount / quiz.questions.length) * 100);
    const xpGained = Math.round((quiz.xpReward * score) / 100);

    const attempt = await prisma.quizAttempt.create({
      data: { userId: user.id, quizId, score, xpGained }
    });

    await addXP(user.id, xpGained);

    return NextResponse.json({ success: true, attempt, xpGained, score });
  } catch (error) {
    console.error('Erreur Quiz POST:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
