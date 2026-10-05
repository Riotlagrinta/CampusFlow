/**
 * Interrupteur unique des paiements (boutique, abonnements, achat de jetons).
 *
 * DÉSACTIVÉ PAR DÉFAUT : les paiements ne s'ouvrent que si NEXT_PUBLIC_PAYMENTS_ENABLED vaut
 * exactement "true" (toute autre valeur, absente ou vide, les ferme). Le code d'achat n'est pas
 * supprimé : il est simplement non atteignable tant que l'interrupteur est fermé.
 *
 * Module pur, importable par le serveur ET par les composants client. La variable est lue avec la
 * notation littérale `process.env.NEXT_PUBLIC_PAYMENTS_ENABLED` : Next.js la remplace par sa valeur
 * au build (navigateur et serveur). Après un changement de valeur, redéployer.
 *
 * Ne concerne PAS les routes qui règlent une transaction déjà existante (callback et vérification
 * Genius Pay, approbation admin) : elles restent actives.
 */

/** Message affiché partout (web, mobile, API) quand les paiements sont fermés. */
export const PAYMENTS_DISABLED_MESSAGE = 'Les paiements ne sont pas encore disponibles.';

/** Code stable renvoyé dans le corps JSON des réponses 503, lisible par le web et le mobile. */
export const PAYMENTS_DISABLED_CODE = 'payments_disabled';

/** Vrai seulement si NEXT_PUBLIC_PAYMENTS_ENABLED === 'true'. */
export function isPaymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
}

/** Corps JSON de l'erreur « paiements désactivés » (format d'erreur API : { error }, plus un code). */
export function paymentsDisabledBody(): { error: string; code: typeof PAYMENTS_DISABLED_CODE } {
  return { error: PAYMENTS_DISABLED_MESSAGE, code: PAYMENTS_DISABLED_CODE };
}

/** Réponse serveur 503 `{ error, code: 'payments_disabled' }` pour les routes API de paiement. */
export function paymentsDisabledResponse(): Response {
  return new Response(JSON.stringify(paymentsDisabledBody()), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
