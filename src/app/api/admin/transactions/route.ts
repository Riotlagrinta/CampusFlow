import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';

const STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;
type Status = (typeof STATUSES)[number];

const DEFAULT_TAKE = 100;
const MAX_TAKE = 200;

/**
 * Liste paginée des transactions (réservé aux administrateurs).
 *  - GET ?take=100&cursor=<id>&status=PENDING : tableau de transactions, plus récentes d'abord.
 *    L'identifiant du curseur de la page suivante est dans l'en-tête `X-Next-Cursor`.
 *  - GET ?summary=1 : { total, pending, completed, failed, revenue } sur l'ensemble des transactions.
 */
export async function GET(req: Request) {
  try {
    // 401 sans session, 403 si connecté sans être administrateur (même contrat que admin/users).
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });

    const params = new URL(req.url).searchParams;

    if (params.get('summary') === '1') {
      const [counts, revenue] = await Promise.all([
        prisma.transaction.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.transaction.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
      ]);
      const byStatus = (s: Status) => counts.find((c) => c.status === s)?._count._all ?? 0;
      return NextResponse.json({
        total: counts.reduce((sum, c) => sum + c._count._all, 0),
        pending: byStatus('PENDING'),
        completed: byStatus('COMPLETED'),
        failed: byStatus('FAILED'),
        revenue: revenue._sum.amount ?? 0,
      });
    }

    const takeParam = Number(params.get('take'));
    const take = Number.isInteger(takeParam) && takeParam > 0 ? Math.min(takeParam, MAX_TAKE) : DEFAULT_TAKE;

    const statusParam = params.get('status');
    const status = STATUSES.find((s) => s === statusParam);

    const cursor = params.get('cursor');
    if (cursor !== null && (cursor.length === 0 || cursor.length > 64)) {
      return NextResponse.json({ error: 'Curseur invalide' }, { status: 400 });
    }

    const rows = await prisma.transaction.findMany({
      where: status ? { status } : undefined,
      select: {
        id: true,
        userId: true,
        amount: true,
        tokens: true,
        packName: true,
        status: true,
        type: true,
        reference: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor } } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return NextResponse.json(page, {
      headers: hasMore ? { 'X-Next-Cursor': rows[take].id } : undefined,
    });
  } catch (error) {
    console.error('Erreur liste transactions:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
