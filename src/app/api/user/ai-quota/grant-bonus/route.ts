import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/../auth';

// CRITICAL FIX: cette route était accessible sans authentification.
// Seul un ADMIN peut désormais octroyer des bonus.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const caller = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (!caller || caller.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { aiBonusRequests: { increment: 5 } }
    });

    return NextResponse.json({ success: true, newBonus: updatedUser.aiBonusRequests });
  } catch (error) {
    console.error('Erreur grant bonus:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
