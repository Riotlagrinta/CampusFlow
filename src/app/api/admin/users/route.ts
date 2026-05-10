import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const sessionUser = await prisma.user.findUnique({ where: { email: session.user.email }, select: { role: true } });
    if (!sessionUser || sessionUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        lastActive: true,
        level: true,
        xp: true,
        role: true,
        isActive: true,
        // MEDIUM FIX: otpCode retiré — ne jamais exposer les codes OTP en clair via l'API
        referralCode: true,
        referredById: true,
        field: { select: { name: true, code: true } },
        academicLevel: { select: { name: true } },
        _count: { select: { referrals: true } }
      },
      orderBy: { lastActive: 'desc' }
    });

    // Calculer le Revenu Total
    const completedTransactions = await prisma.transaction.findMany({
        where: { status: 'COMPLETED' },
        select: { amount: true }
    });
    const totalRevenue = completedTransactions.reduce((acc, curr) => acc + curr.amount, 0);

    // Calculer la consommation de tokens aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const usages = await prisma.dailyAIUsage.findMany({
      where: { date: today }
    });
    const totalTokensToday = usages.reduce((acc: number, curr: { tokensUsed?: number }) => acc + (curr.tokensUsed || 0), 0);

    // Statistiques des 7 derniers jours pour les graphiques
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const weeklyUsages = await prisma.dailyAIUsage.findMany({
      where: { date: { gte: sevenDaysAgo } },
      orderBy: { date: 'asc' }
    });

    type ChartEntry = { day: string; tokens: number; requests: number };
    const chartData = weeklyUsages.reduce((acc: Record<string, ChartEntry>, curr: { date: Date; tokensUsed?: number; requestCount?: number }) => {
      const day = curr.date.toLocaleDateString('fr-FR', { weekday: 'short' });
      if (!acc[day]) acc[day] = { day, tokens: 0, requests: 0 };
      acc[day].tokens += curr.tokensUsed || 0;
      acc[day].requests += curr.requestCount || 0;
      return acc;
    }, {});

    return NextResponse.json({ 
      users, 
      totalTokensToday,
      totalRevenue,
      chartData: Object.values(chartData) 
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
