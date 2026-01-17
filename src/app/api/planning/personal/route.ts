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

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const schedules = await prisma.personalSchedule.findMany({
      where: {
        OR: [
          { userId: user.id },
          { isAcademic: true }
        ]
      },
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
    const { day, time, subject, type } = body;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const newSchedule = await prisma.personalSchedule.create({
      data: {
        userId: user.id,
        day,
        time,
        subject,
        type: type || 'Personnel',
        isAcademic: user.role === 'ADMIN' && type === 'Académique'
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
