import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { sendPushNotifications } from '@/lib/notifications';
import {
  MAX_SEMESTER,
  MIN_SEMESTER,
  getCurrentSemester,
  pageArgs,
  pagedResponse,
  parseIntParam,
  parseListParams,
} from '@/lib/contentListing';

export const dynamic = 'force-dynamic';
// Les notifications push sont envoyées après la réponse (voir after() plus bas).
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_NOTIFIED_STUDENTS = 5000;

const assignmentSelect = {
  id: true,
  title: true,
  content: true,
  dueDate: true,
  semester: true,
  fieldId: true,
  levelId: true,
  subjectId: true,
  createdAt: true,
  subject: { select: { name: true, code: true } },
} as const;

const createSchema = z.object({
  title: z.string().trim().min(3, 'Le titre est trop court').max(200, 'Le titre est trop long'),
  content: z.string().trim().min(1, 'Le contenu est requis').max(5000, 'Le contenu est trop long'),
  dueDate: z
    .string({ error: "La date d'échéance est requise" })
    .refine((v) => !Number.isNaN(Date.parse(v)), "Date d'échéance invalide")
    // Une date seule (AAAA-MM-JJ) vaut fin de journée : le devoir reste « à rendre » le jour J
    .transform((v) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59Z` : v))
    .refine((d) => d.getTime() >= Date.now() - DAY_MS, "L'échéance ne peut pas être dans le passé")
    .refine((d) => d.getTime() <= Date.now() + 3 * 365 * DAY_MS, "Date d'échéance trop lointaine"),
  // Filière et niveau obligatoires : ils déterminent qui voit le devoir et qui est notifié
  fieldId: z.string({ error: 'La filière est requise' }).min(1, 'La filière est requise').max(100),
  levelId: z.string({ error: 'Le niveau est requis' }).min(1, 'Le niveau est requis').max(100),
  subjectId: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().max(100).optional()
  ),
  semester: z.coerce
    .number({ error: 'Semestre invalide' })
    .int('Semestre invalide')
    .min(MIN_SEMESTER, 'Semestre invalide')
    .max(MAX_SEMESTER, 'Semestre invalide')
    .default(() => getCurrentSemester()),
});

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);

    const list = parseListParams(searchParams);
    if ('error' in list) return NextResponse.json({ error: list.error }, { status: 400 });

    const semester = parseIntParam(searchParams.get('semester'), MIN_SEMESTER, MAX_SEMESTER);
    if (semester === null) return NextResponse.json({ error: 'Semestre invalide' }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { fieldId: true, academicLevelId: true },
    });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    // Si ADMIN, on voit tout. Sinon : sa classe, plus les devoirs généraux (sans classe).
    // Sans filière ou sans niveau renseigné, un étudiant ne voit que les devoirs généraux.
    const classFilter =
      user.fieldId && user.academicLevelId
        ? [{ fieldId: user.fieldId, levelId: user.academicLevelId }]
        : [];

    const assignments = await prisma.assignment.findMany({
      where: {
        semester: semester ?? getCurrentSemester(),
        ...(authUser.role === 'ADMIN'
          ? {}
          : { OR: [...classFilter, { fieldId: null, levelId: null }] }),
      },
      select: assignmentSelect,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      ...pageArgs(list),
    });

    return pagedResponse(assignments, list.limit);
  } catch (error) {
    console.error('Erreur GET assignments:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (authUser.role !== 'ADMIN') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
    }
    const { title, content, dueDate, fieldId, levelId, subjectId, semester } = parsed.data;

    const [field, level, subject] = await Promise.all([
      prisma.field.findUnique({ where: { id: fieldId }, select: { code: true } }),
      prisma.level.findUnique({ where: { id: levelId }, select: { id: true } }),
      subjectId
        ? prisma.subject.findFirst({ where: { id: subjectId, fieldId, levelId }, select: { id: true } })
        : null,
    ]);
    if (!field) return NextResponse.json({ error: 'Filière introuvable' }, { status: 400 });
    if (!level) return NextResponse.json({ error: 'Niveau introuvable' }, { status: 400 });
    if (subjectId && !subject) {
      return NextResponse.json({ error: 'Matière introuvable pour cette filière et ce niveau' }, { status: 400 });
    }

    const assignment = await prisma.assignment.create({
      data: { title, content, dueDate, fieldId, levelId, subjectId, semester },
      select: assignmentSelect,
    });

    // Notification push de la classe concernée (filière ET niveau, jamais « tous les utilisateurs »),
    // envoyée après la réponse pour ne pas bloquer l'administrateur.
    after(async () => {
      try {
        const students = await prisma.user.findMany({
          where: { fieldId, academicLevelId: levelId, isActive: true, pushToken: { not: null } },
          select: { pushToken: true },
          take: MAX_NOTIFIED_STUDENTS,
        });
        const tokens = students.flatMap((s) => (s.pushToken ? [s.pushToken] : []));
        if (tokens.length === 0) return;

        const result = await sendPushNotifications(
          tokens,
          'Nouveau Devoir ! 📝',
          `${assignment.title} (Filière ${field.code})`,
          { type: 'assignment', assignmentId: assignment.id }
        );

        // Les jetons que le service refuse définitivement sont retirés de la base
        if (result.invalidTokens.length > 0) {
          await prisma.user.updateMany({
            where: { pushToken: { in: result.invalidTokens } },
            data: { pushToken: null },
          });
        }
      } catch (err) {
        console.error('Erreur notification nouveau devoir:', err);
      }
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    console.error('Erreur POST assignments:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
