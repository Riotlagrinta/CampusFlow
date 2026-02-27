import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";
import { sendPushNotification } from "@/lib/notifications";

function sanitizeHtml(text: string): string {
    // Supprime les balises script
    return text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Pour une désinfection plus robuste, une bibliothèque dédiée serait préférable (ex: DOMPurify ou xss)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;
    const { content } = await req.json();
    
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const sanitizedContent = sanitizeHtml(content);

    const answer = await prisma.answer.create({
      data: {
        content: sanitizedContent,
        questionId: id,
        authorId: user.id
      },
      include: {
        author: { select: { firstName: true, lastName: true, level: true } },
        question: { include: { author: true } }
      }
    });

    // Envoyer une notification Push à l'auteur de la question (si ce n'est pas lui qui répond)
    if (answer.question.authorId !== user.id && answer.question.author.pushToken) {
        await sendPushNotification(
            answer.question.author.pushToken,
            "Nouvelle réponse ! 💬",
            `${user.firstName} a répondu à votre question sur le forum.`,
            { questionId: id }
        );
    }

    // Bonus XP automatique (+10 XP)
    await addXP(user.id, 10);

    return NextResponse.json(answer);
  } catch (error) {
    console.error('Erreur POST answer:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
