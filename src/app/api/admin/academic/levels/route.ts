import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';

const createLevelSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du niveau est requis').max(100, 'Le nom du niveau est trop long'),
});

// 401 si non authentifié, 403 si authentifié sans être administrateur.
// Le rôle est relu en base par getAuthUser : une révocation d'admin est immédiate.
async function authorize(req: Request): Promise<NextResponse | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  try {
    const denied = await authorize(req);
    if (denied) return denied;

    const levels = await prisma.level.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(levels);
  } catch (error) {
    console.error('Erreur GET niveaux:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const denied = await authorize(req);
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    const parsed = createLevelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
    }

    // Level.name n'est pas unique en base : le doublon (insensible à la casse) est refusé ici.
    const existing = await prisma.level.findFirst({
      where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: 'Un niveau portant ce nom existe déjà' }, { status: 409 });
    }

    const level = await prisma.level.create({ data: { name: parsed.data.name } });
    return NextResponse.json(level, { status: 201 });
  } catch (error) {
    console.error('Erreur POST niveau:', error);
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
