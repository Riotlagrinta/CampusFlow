import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { checkRateLimitDb } from '@/lib/rateLimit';
import { resolveFieldScope } from '@/lib/contentListing';
import { questionScopeWhere, quizScopeWhere } from '@/lib/academicScope';

export const dynamic = 'force-dynamic';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const FORUM_EXCERPT_LENGTH = 300;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get('q') ?? '').trim();

    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ resources: [], forum: [], quizzes: [] });
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: `Recherche trop longue (${MAX_QUERY_LENGTH} caractères maximum)` }, { status: 400 });
    }

    // Les recherches « contains » sur le contenu du forum sont coûteuses : on les borne
    const limit = await checkRateLimitDb(`search:${authUser.id}`, 30, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Trop de recherches, réessayez dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { fieldId: true, academicLevelId: true },
    });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    const isAdmin = authUser.role === 'ADMIN';
    const levelId = user.academicLevelId;
    const profile = { role: authUser.role, fieldId: user.fieldId, academicLevelId: levelId };

    // Mêmes règles d'isolation que les pages concernées : liste des ressources, forum et quiz
    // (classe de l'utilisateur, tronc commun GL/RIT inclus, + contenus généraux). Admin : tout.
    const [fieldScope, questionScope, subjectQuizScope] = await Promise.all([
      isAdmin ? null : resolveFieldScope(user.fieldId),
      questionScopeWhere(profile),
      quizScopeWhere(profile),
    ]);

    const resourceScope: Prisma.ResourceWhereInput = isAdmin
      ? {}
      : { OR: [{ fieldId: fieldScope, levelId }, { fieldId: null, levelId: null }] };

    // Un quiz généré depuis une ressource n'est visible que si la ressource l'est aussi
    const quizScope: Prisma.QuizWhereInput = isAdmin
      ? subjectQuizScope
      : { AND: [subjectQuizScope, { OR: [{ resourceId: null }, { resource: { is: resourceScope } }] }] };

    // Recherche parallèle
    const [resources, forum, quizzes] = await Promise.all([
      prisma.resource.findMany({
        where: {
          AND: [resourceScope, { type: { not: 'FOLDER' }, title: { contains: query, mode: 'insensitive' } }],
        },
        select: {
          id: true,
          title: true,
          type: true,
          url: true,
          size: true,
          semester: true,
          parentId: true,
          fieldId: true,
          levelId: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.question.findMany({
        where: {
          AND: [
            questionScope,
            {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { content: { contains: query, mode: 'insensitive' } },
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
          author: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.quiz.findMany({
        where: {
          AND: [
            quizScope,
            {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { subjectName: { contains: query, mode: 'insensitive' } },
              ],
            },
          ],
        },
        select: { id: true, title: true, description: true, subjectName: true, xpReward: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      resources,
      forum: forum.map((q) => ({ ...q, content: q.content.slice(0, FORUM_EXCERPT_LENGTH) })),
      quizzes,
    });
  } catch (error) {
    console.error('Erreur recherche:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
