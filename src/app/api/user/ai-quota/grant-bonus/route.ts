import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // Incrémenter le nombre de requêtes bonus pour l'utilisateur
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        aiBonusRequests: {
          increment: 5 // Par exemple, +5 requêtes par pub
        }
      }
    });

    return NextResponse.json({ success: true, newBonus: updatedUser.aiBonusRequests });
  } catch (error) {
    console.error('Erreur grant bonus:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
