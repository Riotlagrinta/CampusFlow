import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { publicAuthorSelect } from '@/lib/selects';
import { AI_TUTOR_EMAIL, awardActionXP } from '@/lib/xp';

type AcceptOutcome =
  | { kind: 'not_found' }
  | { kind: 'forbidden_not_question_author' }
  | { kind: 'forbidden_own_answer' }
  | { kind: 'already_accepted' }
  | { kind: 'other_accepted' }
  | { kind: 'accepted'; answerAuthorId: string; answerAuthorEmail: string };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { id } = await params;

    // Lecture préalable : uniquement pour connaître la question à verrouiller.
    // Toutes les vérifications qui comptent sont refaites dans la transaction.
    const target = await prisma.answer.findUnique({ where: { id }, select: { questionId: true } });
    if (!target) return NextResponse.json({ error: 'Réponse introuvable' }, { status: 404 });
    const { questionId } = target;

    // Une seule réponse acceptée par question, même avec des requêtes simultanées : la ligne de la
    // question est verrouillée (FOR UPDATE) jusqu'à la fin de la transaction, donc les acceptations
    // concurrentes s'exécutent l'une après l'autre. Seule la requête dont la transaction a réellement
    // marqué la réponse (`accepted`) crédite l'XP.
    const outcome = await prisma.$transaction(async (tx): Promise<AcceptOutcome> => {
      await tx.$queryRaw`SELECT id FROM "Question" WHERE id = ${questionId} FOR UPDATE`;

      const answer = await tx.answer.findUnique({
        where: { id },
        select: {
          authorId: true,
          questionId: true,
          isAccepted: true,
          question: { select: { authorId: true } },
          author: { select: { email: true } },
        },
      });
      if (!answer || answer.questionId !== questionId) return { kind: 'not_found' };

      // Seul l'auteur de la question peut accepter une réponse, et jamais la sienne.
      if (answer.question.authorId !== authUser.id) return { kind: 'forbidden_not_question_author' };
      if (answer.authorId === authUser.id) return { kind: 'forbidden_own_answer' };

      // Idempotent : déjà acceptée = succès sans nouvel XP.
      if (answer.isAccepted) return { kind: 'already_accepted' };

      const otherAccepted = await tx.answer.findFirst({
        where: { questionId, isAccepted: true },
        select: { id: true },
      });
      if (otherAccepted) return { kind: 'other_accepted' };

      await tx.answer.update({ where: { id }, data: { isAccepted: true } });
      return { kind: 'accepted', answerAuthorId: answer.authorId, answerAuthorEmail: answer.author.email };
    });

    switch (outcome.kind) {
      case 'not_found':
        return NextResponse.json({ error: 'Réponse introuvable' }, { status: 404 });
      case 'forbidden_not_question_author':
        return NextResponse.json(
          { error: "Seul l'auteur de la question peut accepter une réponse" },
          { status: 403 }
        );
      case 'forbidden_own_answer':
        return NextResponse.json({ error: 'Vous ne pouvez pas accepter votre propre réponse' }, { status: 403 });
      case 'already_accepted':
        return NextResponse.json({ success: true, alreadyAccepted: true, xpAwarded: false });
      case 'other_accepted':
        return NextResponse.json({ error: 'Une réponse a déjà été acceptée pour cette question' }, { status: 409 });
    }

    // XP à l'auteur de la réponse (plafonné par jour, jamais pour le compte IA).
    let xpAwarded = false;
    if (outcome.answerAuthorEmail !== AI_TUTOR_EMAIL) {
      try {
        xpAwarded = (await awardActionXP(outcome.answerAuthorId, 'answer_accepted')).awarded;
      } catch (e) {
        console.error('Erreur XP réponse acceptée:', e);
      }
    }

    const updated = await prisma.answer.findUnique({
      where: { id },
      select: {
        id: true,
        content: true,
        createdAt: true,
        isAccepted: true,
        author: { select: publicAuthorSelect },
      },
    });

    return NextResponse.json({ success: true, answer: updated, xpAwarded });
  } catch (error) {
    console.error('Erreur accept answer:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
