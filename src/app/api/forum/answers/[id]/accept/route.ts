import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Marquer la réponse comme acceptée
    const answer = await prisma.answer.update({
      where: { id },
      data: { isAccepted: true },
      include: { author: true }
    });

    // Donner un gros bonus à l'auteur de la réponse (+50 XP)
    await addXP(answer.authorId, 50);

    return NextResponse.json({ success: true, answer });
  } catch (error) {
    console.error('Erreur accept answer:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
