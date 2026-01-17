import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quiz = await prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: true
      }
    });

    if (!quiz) return NextResponse.json({ error: 'Quiz non trouvé' }, { status: 404 });

    return NextResponse.json(quiz);
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
