import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/../auth';

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
    // CRITICAL FIX: la vérification admin se basait sur un paramètre email
    // fourni par le client — n'importe qui pouvait passer l'email d'un admin.
    // On utilise désormais uniquement la session serveur.
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const caller = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true }
    });

    if (!caller || caller.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    const { id } = await params;
    await prisma.answer.deleteMany({ where: { questionId: id } });
    await prisma.question.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE question:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
