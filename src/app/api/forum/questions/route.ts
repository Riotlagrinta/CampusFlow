import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";

export async function GET() {
  try {
    const questions = await prisma.question.findMany({
      include: {
        author: { select: { firstName: true, lastName: true, level: true } },
        _count: { select: { answers: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(questions);
  } catch (error) {
    console.error('Erreur GET questions:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const { title, content, tags } = body;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const question = await prisma.question.create({
      data: {
        title,
        content,
        tags,
        authorId: user.id
      }
    });

    // Bonus: +20 XP automatique
    await addXP(user.id, 20);

    return NextResponse.json(question);
  } catch (error) {
    console.error('Erreur POST question:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
