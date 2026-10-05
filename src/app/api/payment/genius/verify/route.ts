import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { checkRateLimitDb } from '@/lib/rateLimit';
import {
  MANUAL_REF_PREFIX,
  isGatewayReference,
  logPayment,
  logPaymentError,
  notifyFulfillment,
  runAfterResponse,
  settleGeniusTransaction,
} from '@/lib/fulfillment';
import { presentedStatus } from '@/lib/paymentStatus';

const bodySchema = z.object({
  transactionId: z.string().min(1).max(64),
});

/**
 * Vérification à la demande d'un paiement Genius Pay de l'utilisateur connecté
 * (page de retour de paiement). Même contrôle que le webhook : l'état réel est
 * relu chez Genius Pay, rien n'est jamais déduit de la requête du client.
 * Réponse : { status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' }.
 * EXPIRED est une simple présentation (transaction PENDING de plus de 24 h) :
 * la base n'est pas modifiée et un paiement confirmé plus tard est toujours crédité.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const limit = await checkRateLimitDb(`genius-verify:user:${user.id}`, 40, 10 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Trop de vérifications. Réessayez dans quelques minutes.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Transaction invalide.' }, { status: 400 });

    const tx = await prisma.transaction.findFirst({
      where: { id: parsed.data.transactionId, userId: user.id },
      select: { id: true, status: true, amount: true, reference: true, createdAt: true },
    });
    if (!tx) return NextResponse.json({ error: 'Transaction introuvable.' }, { status: 404 });

    // Les demandes manuelles restent en attente d'un administrateur : jamais présentées comme expirées.
    const isManual = tx.reference?.startsWith(MANUAL_REF_PREFIX) ?? false;
    const pendingStatus = () => (isManual ? 'PENDING' : presentedStatus('PENDING', tx.createdAt));

    // FAILED reste vérifiable : un paiement finalement confirmé par la passerelle est rouvert puis crédité.
    if ((tx.status !== 'PENDING' && tx.status !== 'FAILED') || !isGatewayReference(tx.reference)) {
      return NextResponse.json({ status: tx.status === 'PENDING' ? pendingStatus() : tx.status });
    }

    const outcome = await settleGeniusTransaction(tx);

    switch (outcome.kind) {
      case 'fulfilled': {
        logPayment('verify_fulfilled', {
          transactionId: outcome.result.transactionId,
          userId: outcome.result.userId,
          type: outcome.result.type,
          amount: outcome.result.amount,
          tokens: outcome.result.tokens,
        });
        const { result } = outcome;
        runAfterResponse(() => notifyFulfillment(result, 'GENIUS'));
        return NextResponse.json({ status: 'COMPLETED' });
      }
      case 'already_processed':
        return NextResponse.json({ status: outcome.transactionStatus });
      case 'failed':
        return NextResponse.json({ status: 'FAILED' });
      case 'not_confirmed':
        return NextResponse.json({ status: pendingStatus() });
      case 'rejected':
        logPaymentError('verify_rejected', { transactionId: tx.id, reason: outcome.reason });
        return NextResponse.json({ status: pendingStatus() });
      case 'gateway_error':
        logPaymentError('verify_gateway_error', { transactionId: tx.id, reason: outcome.reason, httpStatus: outcome.httpStatus });
        return NextResponse.json({ error: 'Vérification impossible pour le moment.' }, { status: 502 });
    }
  } catch (error) {
    logPaymentError('verify_error', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
