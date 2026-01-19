import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const session = await auth();

    // Vérification de sécurité via la session serveur
    if (!session || (session.user as any).role !== 'ADMIN') {
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
        otpCode: true,
        field: { select: { name: true, code: true } },
        academicLevel: { select: { name: true } },
        badges: {
          include: {
            badge: true
          }
        }
      },
      orderBy: { lastActive: 'desc' }
    });

    // Calculer la consommation de tokens aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const usages = await prisma.dailyAIUsage.findMany({
      where: { date: today }
    });
    const totalTokensToday = usages.reduce((acc: number, curr: any) => acc + (curr.tokensUsed || 0), 0);

    // Statistiques des 7 derniers jours pour les graphiques
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const weeklyUsages = await prisma.dailyAIUsage.findMany({
      where: { date: { gte: sevenDaysAgo } },
      orderBy: { date: 'asc' }
    });

    // Grouper par date pour le graphique
    const chartData = weeklyUsages.reduce((acc: any, curr: any) => {
      const day = curr.date.toLocaleDateString('fr-FR', { weekday: 'short' });
      if (!acc[day]) acc[day] = { day, tokens: 0, requests: 0 };
      acc[day].tokens += curr.tokensUsed || 0;
      acc[day].requests += curr.requestCount || 0;
      return acc;
    }, {});

    return NextResponse.json({ 
      users, 
      totalTokensToday,
      chartData: Object.values(chartData) 
    });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
