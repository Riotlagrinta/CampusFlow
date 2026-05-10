import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from '@/../auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // HIGH FIX: cette route n'avait aucune authentification — n'importe qui
    // pouvait accorder +50 XP à n'importe quel utilisateur.
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;

    const answer = await prisma.answer.findUnique({
      where: { id },
      include: {
        question: { select: { authorId: true } },
        author: true
      }
    });

    if (!answer) {
      return NextResponse.json({ error: 'Réponse introuvable' }, { status: 404 });
    }

    // Seul l'auteur de la question peut accepter une réponse
    const caller = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!caller) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    const isQuestionAuthor = answer.question.authorId === caller.id;
    const isAdmin = caller.role === 'ADMIN';

    if (!isQuestionAuthor && !isAdmin) {
      return NextResponse.json({ error: 'Seul l\'auteur de la question peut accepter une réponse' }, { status: 403 });
    }

    const updated = await prisma.answer.update({
      where: { id },
      data: { isAccepted: true },
      include: { author: true }
    });

    await addXP(updated.authorId, 50);

    return NextResponse.json({ success: true, answer: updated });
  } catch (error) {
    console.error('Erreur accept answer:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
