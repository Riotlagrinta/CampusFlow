import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { MAX_SEMESTER, MIN_SEMESTER } from '@/lib/contentListing';

const semesterSchema = z
    .number({ error: 'Semestre invalide' })
    .int('Semestre invalide')
    .min(MIN_SEMESTER, 'Semestre invalide')
    .max(MAX_SEMESTER, 'Semestre invalide');

const cloneSchema = z
    .object({
        fieldId: z.string().min(1, 'Filière requise').max(100),
        levelId: z.string().min(1, 'Niveau requis').max(100),
        sourceSemester: semesterSchema,
        targetSemester: semesterSchema,
    })
    .refine((v) => v.sourceSemester !== v.targetSemester, {
        message: 'Les semestres source et cible doivent être différents',
    });

class NoSourceError extends Error {}

export async function POST(req: Request) {
    try {
        const user = await getAuthUser(req);
        if (!user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }
        if (user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
        }

        const body = await req.json().catch(() => null);
        const parsed = cloneSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' }, { status: 400 });
        }
        const { fieldId, levelId, sourceSemester, targetSemester } = parsed.data;

        // Lecture, suppression et recréation dans une seule transaction : en cas d'échec,
        // le semestre cible garde son planning d'origine.
        const count = await prisma.$transaction(async (tx) => {
            // 1. Récupérer les cours du semestre source
            const sourceSchedules = await tx.personalSchedule.findMany({
                where: { fieldId, levelId, semester: sourceSemester, isAcademic: true },
            });
            if (sourceSchedules.length === 0) throw new NoSourceError();

            // 2. Supprimer les cours existants dans le semestre cible (pour éviter les doublons)
            await tx.personalSchedule.deleteMany({
                where: { fieldId, levelId, semester: targetSemester, isAcademic: true },
            });

            // 3. Créer les nouveaux cours dans le semestre cible
            const created = await tx.personalSchedule.createMany({
                data: sourceSchedules.map((schedule) => ({
                    userId: schedule.userId,
                    day: schedule.day,
                    time: schedule.time,
                    subjectName: schedule.subjectName,
                    subjectId: schedule.subjectId,
                    credits: schedule.credits,
                    teacher: schedule.teacher,
                    type: schedule.type,
                    isAcademic: true,
                    fieldId: schedule.fieldId,
                    levelId: schedule.levelId,
                    semester: targetSemester,
                })),
            });
            return created.count;
        });

        return NextResponse.json({
            success: true,
            count,
            message: `Planning cloné avec succès du S${sourceSemester} vers le S${targetSemester}`
        });

    } catch (error) {
        if (error instanceof NoSourceError) {
            return NextResponse.json({ error: 'Aucun cours trouvé dans le semestre source' }, { status: 404 });
        }
        console.error('Erreur Clone Planning:', error);
        return NextResponse.json({ error: 'Erreur serveur lors du clonage' }, { status: 500 });
    }
}
