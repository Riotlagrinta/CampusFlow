import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/../auth';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // 1. Vérifier s'il y a des étudiants
    const userCount = await prisma.user.count({
      where: { fieldId: id }
    });

    if (userCount > 0) {
      return NextResponse.json({ 
        error: `Impossible de supprimer : ${userCount} étudiant(s) sont inscrits dans cette filière. Réassignez-les d'abord.` 
      }, { status: 400 });
    }

    // 2. Nettoyer ou détacher les dépendances via une transaction
    await prisma.$transaction([
      // Supprimer les plannings académiques de cette filière
      prisma.personalSchedule.deleteMany({
        where: { fieldId: id, isAcademic: true }
      }),
      // Détacher les ressources (mettre fieldId = null)
      prisma.resource.updateMany({
        where: { fieldId: id },
        data: { fieldId: null }
      }),
      // Détacher les questions du forum
      prisma.question.updateMany({
        where: { fieldId: id },
        data: { fieldId: null }
      }),
      // Enfin, supprimer la filière
      prisma.field.delete({
        where: { id }
      })
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression filière:', error);
    return NextResponse.json({ error: 'Erreur serveur lors de la suppression' }, { status: 500 });
  }
}
