import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

const DAILY_AI_LIMIT = 5; // Synchronisé avec chat/route.ts
const DAILY_QUIZ_LIMIT = 2;

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
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
