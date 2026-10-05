import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';

const MIN_SEMESTER = 1;
const MAX_SEMESTER = 12;

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Identifiant invalide');
const semesterSchema = z.coerce
  .number({ error: 'Semestre invalide' })
  .int('Semestre invalide')
  .min(MIN_SEMESTER, 'Semestre invalide')
  .max(MAX_SEMESTER, 'Semestre invalide');

const listQuerySchema = z.object({
  fieldId: idSchema.optional(),
  levelId: idSchema.optional(),
  semester: semesterSchema.optional(),
});

const createSubjectSchema = z.object({
  name: z.string().trim().min(2, 'Le nom de la matière est trop court').max(150, 'Le nom de la matière est trop long'),
  code: z
    .string()
    .trim()
    .max(30, 'Le code est trop long (30 caractères maximum)')
    .nullish()
    .transform((value) => value || null),
  fieldId: idSchema,
  levelId: idSchema,
  semester: semesterSchema.optional(),
});

// 401 si non authentifié, 403 si authentifié sans être administrateur.
// Le rôle est relu en base par getAuthUser : une révocation d'admin est immédiate.
async function authorize(req: Request): Promise<NextResponse | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
  return null;
}

// GET: Lister toutes les matières (avec filière et niveau)
export async function GET(req: Request) {
  try {
    const denied = await authorize(req);
    if (denied) return denied;

    const searchParams = new URL(req.url).searchParams;
    const parsed = listQuerySchema.safeParse({
      fieldId: searchParams.get('fieldId') || undefined,
      levelId: searchParams.get('levelId') || undefined,
      semester: searchParams.get('semester') || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' }, { status: 400 });
    }

    const where: Prisma.SubjectWhereInput = {};
    if (parsed.data.fieldId) where.fieldId = parsed.data.fieldId;
    if (parsed.data.levelId) where.levelId = parsed.data.levelId;
    if (parsed.data.semester !== undefined) where.semester = parsed.data.semester;

    const subjects = await prisma.subject.findMany({
      where,
      include: {
        field: { select: { name: true, code: true } },
        level: { select: { name: true } },
        _count: { select: { resources: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(subjects);
  } catch (error) {
    console.error('Erreur GET subjects:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST: Créer une nouvelle matière
export async function POST(req: Request) {
  try {
    const denied = await authorize(req);
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    const parsed = createSubjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
    }
    const { name, code, fieldId, levelId, semester } = parsed.data;

    const [field, level] = await Promise.all([
      prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } }),
      prisma.level.findUnique({ where: { id: levelId }, select: { id: true } }),
    ]);
    if (!field) return NextResponse.json({ error: 'Filière introuvable' }, { status: 404 });
    if (!level) return NextResponse.json({ error: 'Niveau introuvable' }, { status: 404 });

    // Pas de contrainte d'unicité en base : une même matière ne peut exister deux fois
    // pour la même filière, le même niveau et le même semestre.
    const duplicate = await prisma.subject.findFirst({
      where: {
        fieldId,
        levelId,
        semester: semester ?? MIN_SEMESTER,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: 'Cette matière existe déjà pour cette filière, ce niveau et ce semestre' }, { status: 409 });
    }

    const subject = await prisma.subject.create({
      data: { name, code, fieldId, levelId, ...(semester !== undefined ? { semester } : {}) },
    });

    return NextResponse.json(subject, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return NextResponse.json({ error: 'Cette matière existe déjà' }, { status: 409 });
      if (error.code === 'P2003') return NextResponse.json({ error: 'Filière ou niveau introuvable' }, { status: 404 });
    }
    console.error('Erreur POST subject:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
