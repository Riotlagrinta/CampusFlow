import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { awardActionXP } from '@/lib/xp';
import { getAuthUser } from '@/lib/session';
import { getCurrentSemester } from '@/lib/semester';
import {
  MAX_SEMESTER,
  MIN_SEMESTER,
  pageArgs,
  pagedResponse,
  parseIntParam,
  parseListParams,
  resolveFieldScope,
} from '@/lib/contentListing';

export const dynamic = 'force-dynamic';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;
const TYPE_PERSONAL = 'Personnel';
const TYPE_ACADEMIC = 'Académique';

// Plafond anti-abus : créneaux personnels par semestre
const MAX_PERSONAL_EVENTS_PER_SEMESTER = 100;

const blankToUndefined = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().max(100).optional()
);

const eventSchema = z.object({
  day: z.enum(DAYS, { error: 'Jour invalide' }),
  time: z.string().trim().min(1, 'Horaire requis').max(50, 'Horaire trop long'),
  subject: z.string().trim().min(1, 'Activité ou matière requise').max(120, 'Intitulé trop long'),
  type: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.enum([TYPE_PERSONAL, TYPE_ACADEMIC], { error: 'Type de créneau invalide' }).optional()
  ),
  fieldId: blankToUndefined,
  levelId: blankToUndefined,
  semester: z.coerce
    .number({ error: 'Semestre invalide' })
    .int('Semestre invalide')
    .min(MIN_SEMESTER, 'Semestre invalide')
    .max(MAX_SEMESTER, 'Semestre invalide')
    .default(() => getCurrentSemester()),
});

const updateSchema = eventSchema.extend({ id: z.string().min(1, 'ID requis').max(100) });

// Champs renvoyés au client (jamais d'identifiant d'utilisateur)
const scheduleSelect = {
  id: true,
  day: true,
  time: true,
  subjectName: true,
  subjectId: true,
  credits: true,
  teacher: true,
  type: true,
  isAcademic: true,
  fieldId: true,
  levelId: true,
  semester: true,
  createdAt: true,
  subject: { select: { name: true } },
} as const;

/**
 * Retrouve la matière correspondant à l'intitulé. Seuls les admins (créneau académique)
 * peuvent créer une nouvelle matière : un étudiant ne fait que se rattacher à une matière existante.
 */
async function resolveSubjectId(opts: {
  name: string;
  fieldId: string | null | undefined;
  levelId: string | null | undefined;
  semester: number;
  canCreate: boolean;
}): Promise<string | null> {
  const { name, fieldId, levelId, semester, canCreate } = opts;
  if (!fieldId || !levelId) return null;

  const existing = await prisma.subject.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, fieldId, levelId, semester },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (!canCreate) return null;

  const created = await prisma.subject.create({
    data: { name, fieldId, levelId, semester },
    select: { id: true },
  });
  return created.id;
}

/** Vérifie qu'une filière et un niveau existent (évite une violation de clé étrangère). */
async function classExists(fieldId: string, levelId: string): Promise<boolean> {
  const [field, level] = await Promise.all([
    prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } }),
    prisma.level.findUnique({ where: { id: levelId }, select: { id: true } }),
  ]);
  return Boolean(field && level);
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const list = parseListParams(searchParams);
    if ('error' in list) return NextResponse.json({ error: list.error }, { status: 400 });

    const semester = parseIntParam(searchParams.get('semester'), MIN_SEMESTER, MAX_SEMESTER);
    if (semester === null) return NextResponse.json({ error: 'Semestre invalide' }, { status: 400 });

    const filterFieldId = searchParams.get('fieldId');
    const filterLevelId = searchParams.get('levelId');
    if ((filterFieldId?.length ?? 0) > 100 || (filterLevelId?.length ?? 0) > 100) {
      return NextResponse.json({ error: 'Filtre invalide' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, fieldId: true, academicLevelId: true },
    });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    const effectiveSemester = semester ?? getCurrentSemester();

    let whereClause;
    if (authUser.role === 'ADMIN' && filterFieldId && filterLevelId) {
      // Vue admin : planning académique d'une classe
      whereClause = {
        isAcademic: true,
        fieldId: filterFieldId,
        levelId: filterLevelId,
        semester: effectiveSemester,
      };
    } else {
      // Isolation dynamique pour le tronc commun
      const fieldScope = await resolveFieldScope(user.fieldId);
      whereClause = {
        semester: effectiveSemester,
        OR: [
          { userId: user.id },
          { isAcademic: true, fieldId: fieldScope, levelId: user.academicLevelId },
        ],
      };
    }

    const schedules = await prisma.personalSchedule.findMany({
      where: whereClause,
      select: scheduleSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...pageArgs(list),
    });
    return pagedResponse(schedules, list.limit);
  } catch (error) {
    console.error('Erreur GET planning perso:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
    }
    const { day, time, subject: subjectName, type, fieldId, levelId, semester } = parsed.data;

    const isAdmin = authUser.role === 'ADMIN';
    if (type === TYPE_ACADEMIC && !isAdmin) {
      return NextResponse.json({ error: 'Les créneaux académiques sont réservés aux administrateurs' }, { status: 403 });
    }
    const isAcademic = type === TYPE_ACADEMIC;

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, fieldId: true, academicLevelId: true },
    });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    let finalFieldId: string | null;
    let finalLevelId: string | null;
    if (isAcademic) {
      if (!fieldId || !levelId) {
        return NextResponse.json({ error: 'Filière et niveau requis pour un créneau académique' }, { status: 400 });
      }
      if (!(await classExists(fieldId, levelId))) {
        return NextResponse.json({ error: 'Filière ou niveau introuvable' }, { status: 400 });
      }
      finalFieldId = fieldId;
      finalLevelId = levelId;
    } else {
      finalFieldId = user.fieldId;
      finalLevelId = user.academicLevelId;

      const personalCount = await prisma.personalSchedule.count({
        where: { userId: user.id, isAcademic: false, semester },
      });
      if (personalCount >= MAX_PERSONAL_EVENTS_PER_SEMESTER) {
        return NextResponse.json(
          { error: `Limite de ${MAX_PERSONAL_EVENTS_PER_SEMESTER} créneaux personnels par semestre atteinte` },
          { status: 400 }
        );
      }
    }

    // Gestion automatique de la matière
    const subjectId = await resolveSubjectId({
      name: subjectName,
      fieldId: finalFieldId,
      levelId: finalLevelId,
      semester,
      canCreate: isAcademic,
    });

    const newSchedule = await prisma.personalSchedule.create({
      data: {
        userId: user.id,
        day,
        time,
        subjectName,
        subjectId,
        type: isAcademic ? TYPE_ACADEMIC : TYPE_PERSONAL,
        isAcademic,
        fieldId: finalFieldId,
        levelId: finalLevelId,
        semester,
      },
      select: scheduleSelect,
    });

    // Bonus XP pour un créneau personnel, plafonné par jour (barème `planning` de xp.ts) :
    // créer puis supprimer des créneaux en boucle ne rapporte plus rien au-delà du plafond.
    // Un échec d'XP ne doit pas faire échouer la création déjà enregistrée.
    if (!isAcademic) {
      try {
        await awardActionXP(user.id, 'planning');
      } catch (xpError) {
        console.error('Erreur XP planning:', xpError);
      }
    }

    return NextResponse.json(newSchedule, { status: 201 });
  } catch (error) {
    console.error('Erreur POST planning perso:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
    }
    const { id, day, time, subject: subjectName, type, fieldId, levelId, semester } = parsed.data;

    const existing = await prisma.personalSchedule.findUnique({
      where: { id },
      select: { userId: true, isAcademic: true, fieldId: true, levelId: true },
    });
    if (!existing) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });

    // Sécurité : le propriétaire ou un admin
    const isAdmin = authUser.role === 'ADMIN';
    const isOwner = existing.userId === authUser.id;
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
    // Un créneau académique appartient à l'admin qui l'a créé : « être propriétaire » ne suffit pas.
    // Sans ce test, un ADMIN dont le second facteur n'est pas validé (rôle effectif STUDENT) resterait
    // maître de ces créneaux, visibles par toute une classe.
    if (existing.isAcademic && !isAdmin) {
      return NextResponse.json({ error: 'Les créneaux académiques sont réservés aux administrateurs' }, { status: 403 });
    }

    // Un créneau ne passe pas de personnel à académique (ni l'inverse) par une modification
    const isAcademic = existing.isAcademic;
    if (type !== undefined && (type === TYPE_ACADEMIC) !== isAcademic) {
      return NextResponse.json({ error: 'Le type d\'un créneau ne peut pas être modifié' }, { status: 400 });
    }

    let finalFieldId: string | null | undefined;
    let finalLevelId: string | null | undefined;
    if (isAcademic) {
      if (!fieldId || !levelId) {
        return NextResponse.json({ error: 'Filière et niveau requis pour un créneau académique' }, { status: 400 });
      }
      if (!(await classExists(fieldId, levelId))) {
        return NextResponse.json({ error: 'Filière ou niveau introuvable' }, { status: 400 });
      }
      finalFieldId = fieldId;
      finalLevelId = levelId;
    } else if (isOwner) {
      const owner = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: { fieldId: true, academicLevelId: true },
      });
      finalFieldId = owner?.fieldId ?? null;
      finalLevelId = owner?.academicLevelId ?? null;
    } else {
      // Un admin modifie le créneau privé d'un étudiant : sa filière/son niveau restent inchangés
      finalFieldId = undefined;
      finalLevelId = undefined;
    }

    const subjectId = await resolveSubjectId({
      name: subjectName,
      fieldId: finalFieldId === undefined ? existing.fieldId : finalFieldId,
      levelId: finalLevelId === undefined ? existing.levelId : finalLevelId,
      semester,
      canCreate: isAcademic,
    });

    const updatedSchedule = await prisma.personalSchedule.update({
      where: { id },
      data: {
        day,
        time,
        subjectName,
        subjectId,
        fieldId: finalFieldId,
        levelId: finalLevelId,
        semester,
      },
      select: scheduleSelect,
    });

    return NextResponse.json(updatedSchedule);
  } catch (error) {
    console.error('Erreur PUT planning perso:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id || id.length > 100) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const schedule = await prisma.personalSchedule.findUnique({ where: { id }, select: { userId: true, isAcademic: true } });
    if (!schedule) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });

    // Autoriser si c'est le sien OU si c'est un ADMIN
    if (schedule.userId !== authUser.id && authUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
    // Un créneau académique appartient à l'admin qui l'a créé : seul un ADMIN (effectif) le supprime.
    if (schedule.isAcademic && authUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Les créneaux académiques sont réservés aux administrateurs' }, { status: 403 });
    }

    await prisma.personalSchedule.deleteMany({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE planning perso:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
