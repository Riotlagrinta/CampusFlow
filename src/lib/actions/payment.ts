"use server";

import { getAuthUser } from "@/lib/session";
import { startGeniusCheckout } from "@/lib/fulfillment";
import { PAYMENTS_DISABLED_CODE, PAYMENTS_DISABLED_MESSAGE, isPaymentsEnabled } from "@/lib/payments";

type PaymentActionResult =
  | { url: string; error?: undefined; code?: undefined }
  | { error: string; url?: undefined; code?: typeof PAYMENTS_DISABLED_CODE };

/**
 * Crée un paiement Genius Pay pour l'offre `packId` et renvoie le lien de paiement.
 * Toute la logique (catalogue, transaction PENDING, appel passerelle) est dans
 * `startGeniusCheckout`, partagée avec POST /api/payment/genius/create (mobile).
 */
export async function createGeniusPayment(packId: string): Promise<PaymentActionResult> {
  // Interrupteur des paiements : fermé, rien n'est lu ni écrit (ni session, ni base, ni clés).
  if (!isPaymentsEnabled()) return { error: PAYMENTS_DISABLED_MESSAGE, code: PAYMENTS_DISABLED_CODE };

  try {
    if (typeof packId !== "string") return { error: "Pack invalide." };

    const user = await getAuthUser();
    if (!user) return { error: "Vous devez être connecté pour effectuer un achat." };

    const result = await startGeniusCheckout(user.id, packId);
    return result.ok ? { url: result.url } : { error: result.error };
  } catch (error) {
    console.error("Server Action Payment Error:", error instanceof Error ? error.message : error);
    return { error: "Erreur lors de l'initialisation du paiement." };
  }
}
