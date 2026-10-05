import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUser } from '@/lib/session';
import { addXP } from '@/lib/xp';

const bodySchema = z.object({
  userId: z.string().min(1).max(64),
  amount: z.number().int().min(1).max(1000),
});

// Outil d'administration : attribue de l'XP à un utilisateur (aucun appelant côté client/mobile).
export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (authUser.role !== 'ADMIN') return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'userId et amount (entier de 1 à 1000) requis' }, { status: 400 });
    }
    const { userId, amount } = parsed.data;

    const result = await addXP(userId, amount);
    if (!result) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    console.info('[admin-xp]', JSON.stringify({ adminId: authUser.id, userId, amount }));

    return NextResponse.json({
      success: true,
      xp: result.xp,
      level: result.level,
      leveledUp: result.leveledUp,
    });
  } catch (error) {
    console.error('Erreur ajout XP:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
