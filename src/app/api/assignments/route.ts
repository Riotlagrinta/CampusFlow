import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";
import { sendPushNotification } from "@/lib/notifications";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const semester = parseInt(searchParams.get('semester') || '2');

    // Si ADMIN, on voit tout. Sinon, filtré par sa classe.
    const assignments = await prisma.assignment.findMany({
      where: user.role === 'ADMIN' ? { semester } : {
        semester,
        fieldId: user.fieldId,
        levelId: user.academicLevelId
      },
      include: {
        subject: { select: { name: true, code: true } }
      },
      orderBy: { dueDate: 'asc' }
    });

    return NextResponse.json(assignments);
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Interdit' }, { status: 403 });
    }

    const body = await req.json();
    const { title, content, dueDate, fieldId, levelId, subjectId, semester } = body;

    const assignment = await prisma.assignment.create({
      data: {
        title,
        content,
        dueDate: new Date(dueDate),
        fieldId,
        levelId,
        subjectId,
        semester: semester || 2
      },
      include: {
        field: true
      }
    });

    // NOTIFICATION PUSH MASSIVE : Prévenir tous les étudiants de la filière
    const students = await prisma.user.findMany({
        where: { fieldId, academicLevelId: levelId, NOT: { pushToken: null } },
        select: { pushToken: true }
    });

    for (const s of students) {
        if (s.pushToken) {
            await sendPushNotification(
                s.pushToken,
                "Nouveau Devoir ! 📝",
                `${assignment.title} (Filière ${assignment.field?.code || ''})`
            );
        }
    }

    return NextResponse.json(assignment);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
