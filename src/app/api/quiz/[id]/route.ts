import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;
    // SECURITY: on ne sélectionne jamais le champ `answer` (bonne réponse) ici — cet
    // endpoint sert à passer le quiz, la correction se fait côté serveur dans
    // POST /api/quiz. L'exposer permettrait de contourner la notation serveur.
    const quiz = await prisma.quiz.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        subjectName: true,
        subjectId: true,
        xpReward: true,
        resourceId: true,
        subject: true,
        questions: {
          select: {
            id: true,
            question: true,
            options: true,
          }
        }
      }
    });

    if (!quiz) return NextResponse.json({ error: 'Quiz non trouvé' }, { status: 404 });

    return NextResponse.json(quiz);
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
