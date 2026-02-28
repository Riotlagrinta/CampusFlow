import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    // 1. Vérification de sécurité via session serveur
    if (!session || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // 2. Empêcher de se supprimer soi-même
    if (session.user?.id === id) {
      return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, { status: 400 });
    }

    // 3. Suppression en cascade manuelle
    // Supprimer les dépendances
    await prisma.userBadge.deleteMany({ where: { userId: id } });
    await prisma.quizAttempt.deleteMany({ where: { userId: id } });
    await prisma.dailyAIUsage.deleteMany({ where: { userId: id } });
    await prisma.personalSchedule.deleteMany({ where: { userId: id } });
    await prisma.answer.deleteMany({ where: { authorId: id } });
    await prisma.question.deleteMany({ where: { authorId: id } });
    await prisma.resource.deleteMany({ where: { authorId: id } });
    await prisma.transaction.deleteMany({ where: { userId: id } });
    await prisma.bookmark.deleteMany({ where: { userId: id } });
    await prisma.bugReport.deleteMany({ where: { userId: id } });

    // Pour FlashcardSet, we need to delete the cards first if Prisma cascade isn't enough, 
    // but the schema says onDelete: Cascade for Flashcard -> FlashcardSet.
    // So deleting sets should be enough.
    await prisma.flashcardSet.deleteMany({ where: { userId: id } });

    // Enfin, supprimer l'utilisateur
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE user:', error);
    return NextResponse.json({ error: 'Erreur serveur lors de la suppression' }, { status: 500 });
  }
}
