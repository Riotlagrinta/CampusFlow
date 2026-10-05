import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { publicAuthorSelect } from '@/lib/selects';
import { getScopeProfile, questionScopeWhere } from '@/lib/academicScope';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { id } = await params;

    const profile = await getScopeProfile(authUser.id);
    if (!profile) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const scope = await questionScopeWhere(profile);

    // Hors de sa filière/niveau, une question est traitée comme inexistante.
    const question = await prisma.question.findFirst({
      where: { AND: [{ id }, scope] },
      select: {
        id: true,
        title: true,
        content: true,
        tags: true,
        createdAt: true,
        author: { select: publicAuthorSelect },
        answers: {
          orderBy: [{ isAccepted: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
          take: 200,
          select: {
            id: true,
            content: true,
            createdAt: true,
            isAccepted: true,
            author: { select: publicAuthorSelect },
          },
        },
      },
    });

    if (!question) return NextResponse.json({ error: 'Question introuvable' }, { status: 404 });
    return NextResponse.json(question);
  } catch (error) {
    console.error('Erreur GET question detail:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (authUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    const { id } = await params;
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { questionId: id } }),
      prisma.question.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Question introuvable' }, { status: 404 });
    }
    console.error('Erreur DELETE question:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
