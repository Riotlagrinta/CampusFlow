import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';

const BONUS_GRANTED = 5;

const bodySchema = z.object({
  email: z.string().trim().max(254).email(),
});

// Réservé aux ADMIN (rôle relu en base à chaque appel).
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!admin) {
      // 401 si anonyme, 403 si connecté sans droits : requireAdmin ne les distingue pas, on reste prudent.
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Email valide requis' }, { status: 400 });
    }

    let updated: { id: string; aiBonusRequests: number };
    try {
      updated = await prisma.user.update({
        where: { email: body.data.email },
        data: { aiBonusRequests: { increment: BONUS_GRANTED } },
        select: { id: true, aiBonusRequests: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
      }
      throw e;
    }

    // Journal d'audit structuré (aucune donnée personnelle : identifiants uniquement).
    console.info(JSON.stringify({
      event: 'ai_bonus_granted',
      by: admin.id,
      to: updated.id,
      amount: BONUS_GRANTED,
    }));

    return NextResponse.json({ success: true, newBonus: updated.aiBonusRequests });
  } catch (error) {
    console.error('[grant-bonus] erreur:', error instanceof Error ? error.name : 'erreur inconnue');
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
