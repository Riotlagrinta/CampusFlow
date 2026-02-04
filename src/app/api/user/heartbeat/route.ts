import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function POST() {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Mettre à jour la date de dernière activité
    await prisma.user.update({
      where: { email: session.user.email },
      data: { lastActive: new Date() }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur Heartbeat:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}