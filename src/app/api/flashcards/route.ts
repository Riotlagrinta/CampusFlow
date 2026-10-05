import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';

const MAX_SETS_LISTED = 100;
const MAX_SETS_PER_USER = 200;

// `reponse` (sortie de l'IA) ou `answer` (modèle de données) : les deux sont acceptés.
const cardSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
    reponse: z.string().trim().min(1).max(2000).optional(),
    answer: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((c) => !!(c.reponse || c.answer), { message: 'Réponse manquante' });

const createSchema = z.object({
  title: z.string().trim().min(1, 'Titre requis').max(120, 'Titre trop long (120 caractères maximum)'),
  cards: z.array(cardSchema).min(1, 'Au moins une carte').max(50, '50 cartes maximum'),
});

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const sets = await prisma.flashcardSet.findMany({
      where: { userId: user.id },
      include: { cards: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_SETS_LISTED,
    });

    return NextResponse.json(sets);
  } catch (error) {
    console.error('[flashcards] GET:', error instanceof Error ? error.name : 'erreur inconnue');
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = createSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: body.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
    }

    if ((await prisma.flashcardSet.count({ where: { userId: user.id } })) >= MAX_SETS_PER_USER) {
      return NextResponse.json(
        { error: `Limite de ${MAX_SETS_PER_USER} jeux de cartes atteinte. Supprimez-en pour continuer.` },
        { status: 409 }
      );
    }

    const newSet = await prisma.flashcardSet.create({
      data: {
        title: body.data.title,
        userId: user.id,
        cards: {
          create: body.data.cards.map((c) => ({
            question: c.question,
            answer: (c.reponse || c.answer) as string,
          })),
        },
      },
      include: { cards: true },
    });

    return NextResponse.json(newSet);
  } catch (error) {
    console.error('[flashcards] POST:', error instanceof Error ? error.name : 'erreur inconnue');
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
