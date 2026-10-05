import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUser } from '@/lib/session';
import { checkRateLimitDb } from '@/lib/rateLimit';
import { isPaymentsEnabled, paymentsDisabledResponse } from '@/lib/payments';
import { getClientIp, startGeniusCheckout } from '@/lib/fulfillment';

const bodySchema = z.object({
  packId: z.string().min(1).max(50),
});

/**
 * Crée un paiement Genius Pay (cookie web ou Bearer mobile).
 * Corps : { packId } — Réponse : { url, transactionId } (lien de paiement) ou { error }.
 */
export async function POST(req: Request) {
  // Interrupteur des paiements : fermé, rien n'est lu ni écrit (ni base, ni clés, ni rate limit).
  if (!isPaymentsEnabled()) return paymentsDisabledResponse();

  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const ipLimit = await checkRateLimitDb(`genius-create:ip:${getClientIp(req)}`, 30, 10 * 60_000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(ipLimit.retryAfterMs / 1000)) } }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Pack invalide.' }, { status: 400 });

    const result = await startGeniusCheckout(user.id, parsed.data.packId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ url: result.url, transactionId: result.transactionId });
  } catch (error) {
    console.error('Erreur création paiement Genius:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Erreur lors de l'initialisation du paiement." }, { status: 500 });
  }
}
