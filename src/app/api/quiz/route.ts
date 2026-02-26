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

    const quizzes = await prisma.quiz.findMany({
      where: {
        OR: [
          { subjectId: null }, // Quizz généraux (ex: Culture Générale)
          {
            subject: {
              semester,
              ...(user.role === 'ADMIN' ? {} : {
                fieldId: user.fieldId,
                levelId: user.academicLevelId
              })
            }
          }
        ]
      },
      include: {
        _count: { select: { questions: true } },
        subject: true
      }
    });
    return NextResponse.json(quizzes);
  } catch (error) {
    console.error('Erreur Quiz GET:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { quizId, score, email } = await req.json();

    const user = await prisma.user.findUnique({ where: { email } });
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });

    if (!user || !quiz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Calcul de l'XP gagné : xpReward * score%
    const xpGained = Math.round((quiz.xpReward * score) / 100);

    const attempt = await prisma.quizAttempt.create({
      data: {
        userId: user.id,
        quizId,
        score,
        xpGained
      }
    });

    // Ajouter l'XP à l'utilisateur
    await addXP(user.id, xpGained);

    return NextResponse.json({ success: true, attempt, xpGained });
  } catch (error) {
    console.error('Erreur Quiz POST:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
