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

    return NextResponse.json({ users, totalTokensToday });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
