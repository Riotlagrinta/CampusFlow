import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getGeniusWebhookSecret,
  isGatewayReference,
  logPayment,
  logPaymentError,
  notifyFulfillment,
  runAfterResponse,
  settleGeniusTransaction,
  verifyGeniusSignature,
} from '@/lib/fulfillment';

/**
 * Webhook Genius Pay. Chaîne de confiance (toute étape en échec = aucun crédit) :
 *  1. signature HMAC obligatoire sur le corps brut ;
 *  2. la transaction est retrouvée en base PAR RÉFÉRENCE (jamais par un identifiant
 *     fourni par l'appelant), et les métadonnées éventuelles doivent y correspondre ;
 *  3. l'état réel du paiement est relu chez Genius Pay (fail-closed) et comparé
 *     (référence, montant, devise) à la transaction ;
 *  4. le crédit est atomique et idempotent (`fulfillTransaction`).
 * Un échec définitif signalé par Genius Pay (annulé, refusé, expiré...) passe la transaction en
 * FAILED et répond 200 : la passerelle ne doit pas rejouer la notification.
 */
export async function POST(req: Request) {
  try {
    const secretKey = getGeniusWebhookSecret();
    if (!secretKey) {
      logPaymentError('webhook_config_missing');
      return NextResponse.json({ error: 'Configuration de paiement manquante' }, { status: 500 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-genius-signature');
    if (!verifyGeniusSignature(rawBody, signature, secretKey)) {
      logPaymentError('webhook_bad_signature', { hasSignature: Boolean(signature) });
      return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const root = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    const payloadRaw = root?.data ?? root;
    const payload = payloadRaw && typeof payloadRaw === 'object' ? (payloadRaw as Record<string, unknown>) : null;
    if (!payload) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

    const candidates = [payload.reference, payload.id]
      .filter((r): r is string => typeof r === 'string' && r.length > 0 && r.length <= 200)
      .filter(isGatewayReference);
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'Référence de paiement manquante' }, { status: 400 });
    }

    const dbTransaction = await prisma.transaction.findFirst({
      where: { reference: { in: candidates } },
      select: { id: true, status: true, amount: true, reference: true },
    });
    if (!dbTransaction) {
      logPaymentError('webhook_unknown_reference');
      return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 });
    }

    const metadata =
      payload.metadata && typeof payload.metadata === 'object' ? (payload.metadata as Record<string, unknown>) : null;
    const claimedId = metadata?.dbTransactionId;
    if (claimedId !== undefined && claimedId !== dbTransaction.id) {
      logPaymentError('webhook_metadata_mismatch', { transactionId: dbTransaction.id });
      return NextResponse.json({ error: 'Transaction incohérente' }, { status: 400 });
    }

    const outcome = await settleGeniusTransaction(dbTransaction);

    switch (outcome.kind) {
      case 'fulfilled': {
        logPayment('webhook_fulfilled', {
          transactionId: outcome.result.transactionId,
          userId: outcome.result.userId,
          type: outcome.result.type,
          amount: outcome.result.amount,
          tokens: outcome.result.tokens,
        });
        const { result } = outcome;
        runAfterResponse(() => notifyFulfillment(result, 'GENIUS'));
        return NextResponse.json({ success: true });
      }
      case 'already_processed':
        return NextResponse.json({ message: 'Déjà traité' });
      case 'failed':
        // Échec définitif côté passerelle : 200 pour que Genius ne rejoue pas la notification.
        logPayment('webhook_payment_failed', { transactionId: dbTransaction.id, gatewayStatus: outcome.gatewayStatus });
        return NextResponse.json({ message: 'Paiement échoué' });
      case 'not_confirmed':
        logPayment('webhook_not_confirmed', { transactionId: dbTransaction.id, gatewayStatus: outcome.gatewayStatus });
        return NextResponse.json({ error: 'Paiement non confirmé' }, { status: 409 });
      case 'rejected':
        logPaymentError('webhook_rejected', { transactionId: dbTransaction.id, reason: outcome.reason });
        return NextResponse.json({ error: 'Vérification de paiement échouée' }, { status: 403 });
      case 'gateway_error':
        logPaymentError('webhook_gateway_error', {
          transactionId: dbTransaction.id,
          reason: outcome.reason,
          httpStatus: outcome.httpStatus,
        });
        return NextResponse.json(
          { error: 'Vérification de paiement impossible pour le moment' },
          { status: outcome.reason === 'config' ? 500 : 502 }
        );
    }
  } catch (error) {
    logPaymentError('webhook_error', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur interne Webhook' }, { status: 500 });
  }
}
