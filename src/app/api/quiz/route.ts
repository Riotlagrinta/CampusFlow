import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';

export async function GET() {
  try {
    const quizzes = await prisma.quiz.findMany({
      include: {
        _count: { select: { questions: true } }
      }
    });
    return NextResponse.json(quizzes);
  } catch (error) {
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
