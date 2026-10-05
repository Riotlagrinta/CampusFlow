import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';

const createFieldSchema = z.object({
  name: z.string().trim().min(2, 'Le nom de la filière est trop court').max(100, 'Le nom de la filière est trop long'),
  code: z.string().trim().min(1, 'Le code est requis').max(20, 'Le code est trop long (20 caractères maximum)'),
  description: z
    .string()
    .trim()
    .max(500, 'La description est trop longue (500 caractères maximum)')
    .nullish()
    .transform((value) => value || null),
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

    const fields = await prisma.field.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(fields);
  } catch (error) {
    console.error('Erreur GET filières:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const denied = await authorize(req);
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    const parsed = createFieldSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
    }

    const field = await prisma.field.create({ data: parsed.data });
    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Une filière avec ce nom ou ce code existe déjà' }, { status: 409 });
    }
    console.error('Erreur POST filière:', error);
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
