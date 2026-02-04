import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { id } = await params;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!transaction) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 });
    if (transaction.status === 'COMPLETED') return NextResponse.json({ error: 'Déjà validée' }, { status: 400 });

    // Transaction atomique : On valide la transaction ET on crédite l'utilisateur
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id },
        data: { status: 'COMPLETED' }
      }),
      prisma.user.update({
        where: { id: transaction.userId },
        data: { aiBonusRequests: { increment: transaction.tokens } }
      })
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur approbation:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}