import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const question = await prisma.question.findUnique({
      where: { id },
      include: {
        author: { select: { firstName: true, lastName: true, level: true } }, 
        answers: {
          include: {
            author: { select: { firstName: true, lastName: true, level: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!question) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(question);
  } catch (error) {
    console.error('Erreur GET question detail:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    const user = await prisma.user.findUnique({ where: { email: email || '' } });
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Supprimer les réponses d'abord
    await prisma.answer.deleteMany({ where: { questionId: id } });
    // Supprimer la question
    await prisma.question.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE question:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
