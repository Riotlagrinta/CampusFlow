import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";

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

    const answer = await prisma.answer.create({
      data: {
        content,
        questionId: id,
        authorId: user.id
      },
      include: {
        author: { select: { firstName: true, lastName: true, level: true } }
      }
    });

    // Bonus XP automatique (+10 XP)
    await addXP(user.id, 10);

    return NextResponse.json(answer);
  } catch (error) {
    console.error('Erreur POST answer:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
