import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { publicAuthorSelect } from '@/lib/selects';
import { awardActionXP } from '@/lib/xp';
import { getScopeProfile, questionScopeWhere } from '@/lib/academicScope';
import { checkRateLimitDb, getRateLimitKey } from '@/lib/rateLimit';
import { sendPushNotification } from '@/lib/notifications';
import { ANSWER_XP_MIN_LENGTH, answerSchema, firstIssue } from '../../../_lib/forum';

const HOUR_MS = 60 * 60 * 1000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const [byUser, byIp] = await Promise.all([
      checkRateLimitDb(`forum-answer:user:${authUser.id}`, 30, HOUR_MS),
      checkRateLimitDb(`forum-answer:ip:${getRateLimitKey(req)}`, 60, HOUR_MS),
    ]);
    if (!byUser.allowed || !byIp.allowed) {
      const retryAfter = Math.ceil(Math.max(byUser.retryAfterMs, byIp.retryAfterMs) / 1000);
      return NextResponse.json(
        { error: 'Trop de réponses publiées. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    const parsed = answerSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
    const { content } = parsed.data;

    const profile = await getScopeProfile(authUser.id);
    if (!profile) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const scope = await questionScopeWhere(profile);

    // Question inexistante ou hors de sa filière/niveau : 404.
    const question = await prisma.question.findFirst({
      where: { AND: [{ id }, scope] },
      select: { id: true, authorId: true, author: { select: { pushToken: true } } },
    });
    if (!question) return NextResponse.json({ error: 'Question introuvable' }, { status: 404 });

    const duplicate = await prisma.answer.findFirst({
      where: { questionId: question.id, authorId: authUser.id, content },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: 'Vous avez déjà publié cette réponse' }, { status: 409 });
    }

    const answer = await prisma.answer.create({
      data: { content, questionId: question.id, authorId: authUser.id },
      select: {
        id: true,
        content: true,
        createdAt: true,
        isAccepted: true,
        author: { select: publicAuthorSelect },
      },
    });

    const isOwnQuestion = question.authorId === authUser.id;

    // Notification push à l'auteur de la question (jamais bloquante).
    if (!isOwnQuestion && question.author.pushToken) {
      try {
        await sendPushNotification(
          question.author.pushToken,
          'Nouvelle réponse ! 💬',
          `${answer.author.firstName ?? 'Un étudiant'} a répondu à votre question sur le forum.`,
          { questionId: question.id }
        );
      } catch (e) {
        console.error('Erreur notification réponse:', e);
      }
    }

    // XP plafonné par jour, jamais pour répondre à sa propre question ni pour une réponse trop courte.
    let xpGained = 0;
    if (!isOwnQuestion && content.length >= ANSWER_XP_MIN_LENGTH) {
      try {
        xpGained = (await awardActionXP(authUser.id, 'forum_answer')).amount;
      } catch (e) {
        console.error('Erreur XP réponse:', e);
      }
    }

    return NextResponse.json({ ...answer, xpGained });
  } catch (error) {
    console.error('Erreur POST answer:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
