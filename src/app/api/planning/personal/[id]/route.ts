import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const schedule = await prisma.personalSchedule.findUnique({ where: { id } });
    if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Autoriser si c'est le sien OU si c'est un ADMIN
    if (schedule.userId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await prisma.personalSchedule.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE planning perso:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
