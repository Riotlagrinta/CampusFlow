import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { isVercelBlobUrl } from '@/lib/uploadValidation';

const MAX_FOLDER_DEPTH = 50;

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const resource = await prisma.resource.findUnique({ where: { id }, select: { id: true, url: true } });
    if (!resource) {
      return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
    }

    // Ressource + tout son contenu (un dossier supprime ses descendants)
    const ids = [resource.id];
    const urls = [resource.url];
    let level = [resource.id];
    for (let depth = 0; level.length > 0 && depth < MAX_FOLDER_DEPTH; depth++) {
      const children = await prisma.resource.findMany({
        where: { parentId: { in: level } },
        select: { id: true, url: true },
      });
      level = children.map((c) => c.id);
      ids.push(...level);
      urls.push(...children.map((c) => c.url));
    }

    // Tout ou rien : quiz générés (questions + tentatives), favoris, puis les ressources
    await prisma.$transaction(async (tx) => {
      const quizIds = (
        await tx.quiz.findMany({ where: { resourceId: { in: ids } }, select: { id: true } })
      ).map((q) => q.id);

      if (quizIds.length > 0) {
        await tx.quizAttempt.deleteMany({ where: { quizId: { in: quizIds } } });
        await tx.quizQuestion.deleteMany({ where: { quizId: { in: quizIds } } });
        await tx.quiz.deleteMany({ where: { id: { in: quizIds } } });
      }
      await tx.bookmark.deleteMany({ where: { resourceId: { in: ids } } });
      await tx.resource.deleteMany({ where: { id: { in: ids } } });
    });

    // Les fichiers cloud ne sont supprimés qu'une fois la base à jour ; un échec ici laisse
    // seulement un fichier orphelin, jamais une ressource qui pointe vers un fichier absent.
    const blobUrls = urls.filter(isVercelBlobUrl);
    if (blobUrls.length > 0) {
      try {
        await del(blobUrls);
      } catch (err) {
        console.error('Erreur suppression cloud blob:', err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE resource:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
