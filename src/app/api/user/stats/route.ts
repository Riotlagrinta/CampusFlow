import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { getUserRank } from '@/lib/xp';

// Statistiques de l'utilisateur connecté (cookie NextAuth ou Bearer mobile).
// Aucune donnée d'un autre utilisateur n'est jamais renvoyée : pas de paramètre email.
export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        image: true,
        xp: true,
        level: true,
        streak: true,
        bio: true,
        aiBonusRequests: true,
        referralCode: true,
        badges: {
          select: {
            obtainedAt: true,
            badge: { select: { id: true, slug: true, name: true, description: true, icon: true } }
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // Rang : même calcul que /api/user/dashboard-stats et le classement (/api/leaderboard).
    // Un compte exclu du classement (ADMIN, compte IA, inactif) n'a pas de rang.
    const [attempts, rank] = await Promise.all([
      prisma.quizAttempt.aggregate({
        where: { userId: user.id },
        _avg: { score: true },
        _count: { _all: true }
      }),
      getUserRank(user)
    ]);

    return NextResponse.json({
      ...user,
      // Rôle effectif : un ADMIN sans second facteur validé apparaît comme étudiant (voir AuthUser).
      role: authUser.role,
      rank,
      averageScore: Math.round(attempts._avg.score ?? 0),
      quizAttemptsCount: attempts._count._all
    });
  } catch (error) {
    console.error('Erreur stats user:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
