import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { id: setId } = await params;

    // Propriété vérifiée dans la requête elle-même (pas de lire-puis-supprimer).
    // Les cartes sont supprimées en cascade (onDelete: Cascade sur Flashcard.set).
    const deleted = await prisma.flashcardSet.deleteMany({ where: { id: setId, userId: user.id } });
    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Jeu de cartes introuvable' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[flashcards] DELETE:', error instanceof Error ? error.name : 'erreur inconnue');
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
