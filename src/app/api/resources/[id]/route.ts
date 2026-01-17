import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { del } = require('@vercel/blob');
    const { id } = await params;
    const session = await auth();

    // Vérifier l'utilisateur via session
    if (!session || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Trouver la ressource
    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource) {
      return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
    }

    // Supprimer le fichier sur Vercel Blob s'il s'agit d'une URL blob
    if (resource.url.includes('public.blob.vercel-storage.com')) {
      try {
        await del(resource.url);
      } catch (err) {
        console.error('Erreur suppression cloud blob:', err);
      }
    }

    // Supprimer de la base de données (Prisma s'occupera des cascades si configuré, 
    // sinon il faudra supprimer les quizz associés manuellement)
    
    // Supprimer les quizz associés d'abord (car pas de cascade delete par défaut dans schema.prisma)
    const quizzes = await prisma.quiz.findMany({ where: { resourceId: id } });
    for (const quiz of quizzes) {
      // Supprimer les questions du quiz
      await prisma.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
      // Supprimer les tentatives
      await prisma.quizAttempt.deleteMany({ where: { quizId: quiz.id } });
    }
    await prisma.quiz.deleteMany({ where: { resourceId: id } });

    await prisma.resource.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE resource:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
