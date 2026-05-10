import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const session = await auth();

    // CRITICAL FIX: on ignorait le paramètre email côté client qui permettait de lire
    // les données de n'importe quel utilisateur. Désormais seul l'utilisateur connecté
    // peut lire ses propres stats — sauf les admins qui peuvent passer un email cible.
    let userEmail: string | null = null;

    if (session?.user?.email) {
      const caller = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { role: true }
      });

      if (caller?.role === 'ADMIN') {
        const { searchParams } = new URL(req.url);
        userEmail = searchParams.get('email') || session.user.email;
      } else {
        userEmail = session.user.email;
      }
    }

    // Accès mobile via header (JWT vérifié par le middleware)
    if (!userEmail) {
      const headerEmail = req.headers.get('x-user-email');
      if (headerEmail) userEmail = headerEmail;
    }

    if (!userEmail) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
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
        aiBonusRequests: true,
        referralCode: true,
        badges: { include: { badge: true } },
        quizAttempts: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    const averageScore = user.quizAttempts.length > 0
      ? user.quizAttempts.reduce((acc: number, curr: { score: number }) => acc + curr.score, 0) / user.quizAttempts.length
      : 0;

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
