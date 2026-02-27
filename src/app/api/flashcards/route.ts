import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const sets = await prisma.flashcardSet.findMany({
      where: { userId: user.id },
      include: { cards: true },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(sets);
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { title, cards } = await req.json();
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const newSet = await prisma.flashcardSet.create({
      data: {
        title,
        userId: user.id,
        cards: {
          create: cards.map((c: any) => ({
            question: c.question,
            answer: c.reponse || c.answer
          }))
        }
      },
      include: { cards: true }
    });

    return NextResponse.json(newSet);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
