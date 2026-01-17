import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const DAILY_AI_LIMIT = 10; // Doit être synchronisé avec les autres APIs
const DAILY_QUIZ_LIMIT = 2; // Doit être synchronisé avec les autres APIs

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyUsage = await prisma.dailyAIUsage.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: today,
        },
      },
    });

    const totalChatQuota = DAILY_AI_LIMIT + user.aiBonusRequests;
    const usedChat = dailyUsage?.requestCount || 0;
    const remainingChat = Math.max(0, totalChatQuota - usedChat);

    const totalQuizQuota = DAILY_QUIZ_LIMIT + user.aiBonusRequests;
    const usedQuiz = dailyUsage?.quizRequestCount || 0;
    const remainingQuiz = Math.max(0, totalQuizQuota - usedQuiz);


    return NextResponse.json({
      remaining: remainingChat,
      total: totalChatQuota,
      used: usedChat,
      remainingQuiz: remainingQuiz,
      totalQuiz: totalQuizQuota,
      usedQuiz: usedQuiz,
      bonus: user.aiBonusRequests
    });
  } catch (error) {
    console.error('Erreur get quota:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
