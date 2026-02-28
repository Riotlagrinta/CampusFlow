import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    const session = await auth();
    const userEmail = email || session?.user?.email;

    if (!userEmail) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        image: true,
        xp: true,
        level: true,
        streak: true,
        bio: true,
        badges: { include: { badge: true } },
        quizAttempts: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // Calculs réels
    const averageScore = user.quizAttempts.length > 0 
      ? user.quizAttempts.reduce((acc: number, curr: any) => acc + curr.score, 0) / user.quizAttempts.length 
      : 0;

    // Calcul du classement optimisé (O(1) vs O(N))
    const higherRankUserCount = await prisma.user.count({
      where: { xp: { gt: user.xp } }
    });
    const rank = higherRankUserCount + 1;

    return NextResponse.json({
      ...user,
      rank,
      averageScore,
      quizAttemptsCount: user.quizAttempts.length
    });
  } catch (error) {
    console.error('Erreur stats user:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
