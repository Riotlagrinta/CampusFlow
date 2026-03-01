import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session || !session.user?.email) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { role: true }
        });

        if (user?.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
        }

        const body = await req.json();
        const { fieldId, levelId, sourceSemester, targetSemester } = body;

        if (!fieldId || !levelId || !sourceSemester || !targetSemester) {
            return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
        }

        // 1. Récupérer les cours du semestre source
        const sourceSchedules = await prisma.personalSchedule.findMany({
            where: {
                fieldId,
                levelId,
                semester: sourceSemester,
                isAcademic: true
            }
        });

        if (sourceSchedules.length === 0) {
            return NextResponse.json({ error: 'Aucun cours trouvé dans le semestre source' }, { status: 404 });
        }

        // 2. Supprimer les cours existants dans le semestre cible (pour éviter les doublons)
        await prisma.personalSchedule.deleteMany({
            where: {
                fieldId,
                levelId,
                semester: targetSemester,
                isAcademic: true
            }
        });

        // 3. Créer les nouveaux cours dans le semestre cible
        const newSchedulesData = sourceSchedules.map(schedule => ({
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
            semester: targetSemester
        }));

        await prisma.personalSchedule.createMany({
            data: newSchedulesData
        });

        return NextResponse.json({
            success: true,
            count: newSchedulesData.length,
            message: `Planning cloné avec succès du S${sourceSemester} vers le S${targetSemester}`
        });

    } catch (error) {
        console.error('Erreur Clone Planning:', error);
        return NextResponse.json({ error: 'Erreur serveur lors du clonage' }, { status: 500 });
    }
}
