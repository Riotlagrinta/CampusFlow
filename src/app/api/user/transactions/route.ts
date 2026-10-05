import { NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

const DEFAULT_TAKE = 10;
const MAX_TAKE = 50;

/**
 * Transactions de l'utilisateur connecté (plus récentes d'abord).
 * ?id=<transactionId> : la seule transaction demandée (tableau d'au plus un élément) ;
 * ?take=<n> : nombre de lignes (10 par défaut, 50 au plus).
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const params = new URL(req.url).searchParams;
    const id = params.get('id');
    if (id !== null && (id.length === 0 || id.length > 64)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const takeParam = Number(params.get('take'));
    const take = Number.isInteger(takeParam) && takeParam > 0 ? Math.min(takeParam, MAX_TAKE) : DEFAULT_TAKE;

    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id, ...(id ? { id } : {}) },
      select: {
        id: true,
        packName: true,
        amount: true,
        tokens: true,
        status: true,
        type: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Erreur transactions utilisateur:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
