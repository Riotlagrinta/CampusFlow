import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { leaderboardUserFilter } from '@/lib/xp';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const parsed = querySchema.safeParse({
      limit: new URL(req.url).searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: 'Paramètre limit invalide' }, { status: 400 });

    // Ni administrateurs, ni compte IA, ni comptes non activés. Égalités départagées par id
    // pour que le classement ne change pas d'un appel à l'autre.
    const topUsers = await prisma.user.findMany({
      where: leaderboardUserFilter,
      orderBy: [{ xp: 'desc' }, { id: 'asc' }],
      take: parsed.data.limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        image: true,
        xp: true,
        level: true,
      },
    });

    return NextResponse.json(topUsers.map((u, i) => ({ ...u, rank: i + 1 })));
  } catch (error) {
    console.error('Erreur leaderboard:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
