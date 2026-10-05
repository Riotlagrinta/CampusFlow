import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';

// Compte système (inactif, mot de passe inutilisable) qui reçoit les contenus des comptes
// supprimés. Garder la même valeur dans users/route.ts, qui le masque de la liste.
const DELETED_USER_EMAIL = 'compte-supprime@studenthub.invalid';

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/**
 * Suppression d'un utilisateur, en une seule transaction (tout ou rien).
 *
 * Comportement :
 *  - Données personnelles SUPPRIMÉES : badges, tentatives de quiz, quotas IA, favoris,
 *    signalements, jeux de flashcards (et leurs cartes), créneaux de planning personnels,
 *    transactions non abouties (PENDING / FAILED).
 *  - Contenus communautaires ANONYMISÉS, jamais détruits : questions, réponses et ressources
 *    sont rattachées au compte système « Utilisateur supprimé » (l'auteur est obligatoire en
 *    base). Les discussions du forum, les supports de cours et les favoris des autres
 *    étudiants restent donc intacts.
 *  - Transactions COMPLETED conservées (comptabilité), rattachées au compte système.
 *  - Créneaux académiques créés par cet utilisateur (cas d'un admin) : conservés, détachés
 *    de leur auteur (userId = null), car ils servent à toute la filière.
 *  - Filleuls : le lien de parrainage vers le compte supprimé est retiré (referredById = null).
 *  - Un administrateur ne peut pas supprimer son propre compte.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAuthUser(req);
    if (!admin) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (admin.role !== 'ADMIN') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const parsedId = idSchema.safeParse((await params).id);
    if (!parsedId.success) return NextResponse.json({ error: 'Identifiant utilisateur invalide' }, { status: 400 });
    const id = parsedId.data;

    if (admin.id === id) {
      return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, { status: 400 });
    }

    await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id }, select: { email: true } });
        if (!target) throw new HttpError(404, 'Utilisateur introuvable');
        if (target.email === DELETED_USER_EMAIL) {
          throw new HttpError(400, 'Ce compte système ne peut pas être supprimé');
        }

        const deletedAccount = await tx.user.upsert({
          where: { email: DELETED_USER_EMAIL },
          update: {},
          create: {
            email: DELETED_USER_EMAIL,
            // Valeur aléatoire qui n'est pas un hash bcrypt : aucune connexion possible (et isActive = false).
            password: randomBytes(32).toString('hex'),
            firstName: 'Utilisateur',
            lastName: 'supprimé',
            role: 'STUDENT',
            isActive: false,
          },
          select: { id: true },
        });

        // Contenus communautaires et comptabilité : anonymisés
        await tx.question.updateMany({ where: { authorId: id }, data: { authorId: deletedAccount.id } });
        await tx.answer.updateMany({ where: { authorId: id }, data: { authorId: deletedAccount.id } });
        await tx.resource.updateMany({ where: { authorId: id }, data: { authorId: deletedAccount.id } });
        await tx.transaction.deleteMany({ where: { userId: id, status: { not: 'COMPLETED' } } });
        await tx.transaction.updateMany({ where: { userId: id }, data: { userId: deletedAccount.id } });

        // Données personnelles : supprimées
        await tx.userBadge.deleteMany({ where: { userId: id } });
        await tx.quizAttempt.deleteMany({ where: { userId: id } });
        await tx.dailyAIUsage.deleteMany({ where: { userId: id } });
        await tx.bookmark.deleteMany({ where: { userId: id } });
        await tx.bugReport.deleteMany({ where: { userId: id } });
        await tx.flashcard.deleteMany({ where: { set: { userId: id } } });
        await tx.flashcardSet.deleteMany({ where: { userId: id } });
        await tx.personalSchedule.deleteMany({ where: { userId: id, isAcademic: false } });
        await tx.personalSchedule.updateMany({ where: { userId: id }, data: { userId: null } });

        // Filleuls : on retire le lien vers le compte supprimé
        await tx.user.updateMany({ where: { referredById: id }, data: { referredById: null } });

        await tx.user.delete({ where: { id } });
      },
      { maxWait: 5000, timeout: 20000 }
    );

    // Journal sans donnée personnelle
    console.info('[admin-delete-user]', JSON.stringify({ adminId: admin.id, userId: id }));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
      if (error.code === 'P2003') {
        return NextResponse.json({ error: 'Suppression impossible : des données liées subsistent' }, { status: 409 });
      }
    }
    console.error('Erreur DELETE user:', error);
    return NextResponse.json({ error: 'Erreur serveur lors de la suppression' }, { status: 500 });
  }
}
