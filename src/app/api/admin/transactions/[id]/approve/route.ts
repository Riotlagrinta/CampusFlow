import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import {
  FulfillmentError,
  fulfillTransaction,
  logPayment,
  logPaymentError,
  notifyFulfillment,
  runAfterResponse,
} from '@/lib/fulfillment';

/**
 * Approbation manuelle d'une transaction PENDING par un administrateur.
 * Passe par `fulfillTransaction` (le même chemin que le webhook) : le statut,
 * les jetons ET l'abonnement (si type SUBSCRIPTION) sont traités atomiquement,
 * et un double clic ne crédite qu'une seule fois.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 401 sans session, 403 si connecté sans être administrateur (même contrat que admin/users).
    const admin = await getAuthUser(req);
    if (!admin) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (admin.role !== 'ADMIN') return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });

    const { id } = await params;
    if (!id || id.length > 64) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });

    let result;
    try {
      result = await fulfillTransaction(id);
    } catch (e) {
      if (e instanceof FulfillmentError) {
        logPaymentError('admin_approve_refused', { transactionId: id, adminId: admin.id, code: e.code });
        return NextResponse.json({ error: e.message }, { status: e.code === 'CONFLICT' ? 409 : 422 });
      }
      throw e;
    }

    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 });
    }
    if (result.status === 'already_processed') {
      const message =
        result.transactionStatus === 'COMPLETED'
          ? 'Transaction déjà validée'
          : `Transaction non approuvable (statut ${result.transactionStatus})`;
      return NextResponse.json({ error: message }, { status: 409 });
    }

    logPayment('admin_approved', {
      transactionId: result.transactionId,
      adminId: admin.id,
      adminEmail: admin.email,
      userId: result.userId,
      type: result.type,
      amount: result.amount,
      tokens: result.tokens,
    });
    runAfterResponse(() => notifyFulfillment(result, 'ADMIN'));

    return NextResponse.json({
      success: true,
      type: result.type,
      tokens: result.tokens,
      subscriptionExpiresAt: result.subscriptionExpiresAt,
    });
  } catch (error) {
    logPaymentError('admin_approve_error', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
