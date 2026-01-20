import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ 
      where: { email: session.user.email },
      select: { id: true, fieldId: true, academicLevelId: true, role: true }
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const filterFieldId = searchParams.get('fieldId');
    const filterLevelId = searchParams.get('levelId');

    let whereClause: any = {
      OR: [
        { userId: user.id }, 
        { 
          isAcademic: true, 
          fieldId: user.fieldId, 
          levelId: user.academicLevelId 
        }
      ]
    };

    // Admin Override: Si des filtres sont appliqués, on montre l'emploi du temps spécifique de cette classe
    if (user.role === 'ADMIN' && filterFieldId && filterLevelId) {
       whereClause = {
          isAcademic: true,
          fieldId: filterFieldId,
          levelId: filterLevelId
       };
    }

    const schedules = await prisma.personalSchedule.findMany({
      where: whereClause,
      include: { subject: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(schedules);
  } catch (error) {
    console.error('Erreur GET planning perso:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const { day, time, subject: subjectName, type, fieldId, levelId } = body;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const finalFieldId = (user.role === 'ADMIN' && type === 'Académique') ? fieldId : user.fieldId;
    const finalLevelId = (user.role === 'ADMIN' && type === 'Académique') ? levelId : user.academicLevelId;

    // Gestion automatique de la matière
    let subjectId = null;
    if (subjectName && finalFieldId && finalLevelId) {
      const existingSub = await prisma.subject.findFirst({
        where: {
          name: { equals: subjectName, mode: 'insensitive' },
          fieldId: finalFieldId,
          levelId: finalLevelId
        }
      });

      if (existingSub) {
        subjectId = existingSub.id;
      } else {
        const newSub = await prisma.subject.create({
          data: {
            name: subjectName,
            fieldId: finalFieldId,
            levelId: finalLevelId
          }
        });
        subjectId = newSub.id;
      }
    }

    const newSchedule = await prisma.personalSchedule.create({
      data: {
        userId: user.id,
        day,
        time,
        subjectName,
        subjectId,
        type: type || 'Personnel',
        isAcademic: user.role === 'ADMIN' && type === 'Académique',
        fieldId: finalFieldId,
        levelId: finalLevelId,
      },
    });

    // Bonus XP automatique (+10 XP)
    await addXP(user.id, 10);

    return NextResponse.json(newSchedule);
  } catch (error) {
    console.error('Erreur POST planning perso:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const schedule = await prisma.personalSchedule.findUnique({ where: { id } });
    if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Autoriser si c'est le sien OU si c'est un ADMIN
    if (schedule.userId === user.id || user.role === 'ADMIN') {
      await prisma.personalSchedule.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
