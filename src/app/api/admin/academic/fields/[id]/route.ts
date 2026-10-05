import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/**
 * Suppression d'une filière.
 *  - Refusée (409) tant que des étudiants, des matières ou des devoirs y sont rattachés :
 *    ce sont des données qu'on ne détruit ni ne détache silencieusement.
 *  - Les créneaux académiques de la filière sont supprimés ; les créneaux personnels,
 *    les ressources et les questions du forum sont détachés (fieldId = null).
 *  - Tout se passe dans une transaction : tout ou rien.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });

    const parsedId = idSchema.safeParse((await params).id);
    if (!parsedId.success) return NextResponse.json({ error: 'Identifiant de filière invalide' }, { status: 400 });
    const id = parsedId.data;

    await prisma.$transaction(async (tx) => {
      const field = await tx.field.findUnique({ where: { id }, select: { id: true } });
      if (!field) throw new HttpError(404, 'Filière introuvable');

      const userCount = await tx.user.count({ where: { fieldId: id } });
      if (userCount > 0) {
        throw new HttpError(
          409,
          `Impossible de supprimer : ${userCount} étudiant(s) sont inscrits dans cette filière. Réassignez-les d'abord.`
        );
      }

      const subjectCount = await tx.subject.count({ where: { fieldId: id } });
      if (subjectCount > 0) {
        throw new HttpError(
          409,
          `Impossible de supprimer : ${subjectCount} matière(s) sont rattachées à cette filière. Supprimez-les ou déplacez-les d'abord.`
        );
      }

      const assignmentCount = await tx.assignment.count({ where: { fieldId: id } });
      if (assignmentCount > 0) {
        throw new HttpError(
          409,
          `Impossible de supprimer : ${assignmentCount} devoir(s) sont rattachés à cette filière. Supprimez-les d'abord.`
        );
      }

      // Planning académique de la filière : supprimé. Les créneaux personnels restants sont détachés.
      await tx.personalSchedule.deleteMany({ where: { fieldId: id, isAcademic: true } });
      await tx.personalSchedule.updateMany({ where: { fieldId: id }, data: { fieldId: null } });
      await tx.resource.updateMany({ where: { fieldId: id }, data: { fieldId: null } });
      await tx.question.updateMany({ where: { fieldId: id }, data: { fieldId: null } });
      await tx.field.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return NextResponse.json({ error: 'Filière introuvable' }, { status: 404 });
      if (error.code === 'P2003') {
        return NextResponse.json({ error: 'Cette filière est encore utilisée par d\'autres données' }, { status: 409 });
      }
    }
    console.error('Erreur suppression filière:', error);
    return NextResponse.json({ error: 'Erreur serveur lors de la suppression' }, { status: 500 });
  }
}
