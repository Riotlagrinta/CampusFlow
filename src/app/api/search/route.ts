import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
      return NextResponse.json({ resources: [], forum: [], quizzes: [] });
    }

    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' },
      select: { fieldId: true, academicLevelId: true }
    });

    // Recherche parallèle
    const [resources, forum, quizzes] = await Promise.all([
      prisma.resource.findMany({
        where: {
          title: { contains: query, mode: 'insensitive' },
          fieldId: user?.fieldId,
          levelId: user?.academicLevelId
        },
        take: 5
      }),
      prisma.question.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } }
          ]
        },
        include: { author: { select: { firstName: true, lastName: true } } },
        take: 5
      }),
      prisma.quiz.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { subject: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: 5
      })
    ]);

    return NextResponse.json({ resources, forum, quizzes });
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
