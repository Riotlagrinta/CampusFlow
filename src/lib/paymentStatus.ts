/**
 * Classification des statuts de paiement Genius Pay et expiration d'affichage.
 * Module pur (aucune dépendance serveur) : importable depuis une page client et testable sans base.
 */

/** Statut Genius Pay signifiant un paiement abouti (seul statut qui autorise un crédit). */
export const GATEWAY_SUCCESS_STATUS = 'SUCCESS';

/**
 * Statuts Genius Pay considérés comme un ÉCHEC DÉFINITIF (la transaction locale passe en FAILED).
 *
 * ATTENTION : la documentation officielle de Genius Pay n'a pas pu être vérifiée ; ce vocabulaire
 * est une liste prudente de synonymes courants. Tout statut absent de cette liste (ex. PENDING,
 * PROCESSING, INITIATED, ou un mot inconnu) reste traité comme « en attente » : on ne marque jamais
 * un paiement en échec sur un statut ambigu. Comparer en majuscules (voir `classifyGatewayStatus`).
 */
export const GATEWAY_FAILED_STATUSES: readonly string[] = [
  'FAILED',
  'CANCELLED',
  'CANCELED',
  'EXPIRED',
  'DECLINED',
  'REJECTED',
  'ERROR',
];

export type GatewayStatusClass = 'success' | 'failed' | 'pending';

/** Classe un statut renvoyé par la passerelle (insensible à la casse et aux espaces). */
export function classifyGatewayStatus(status: string | null | undefined): GatewayStatusClass {
  const normalized = typeof status === 'string' ? status.trim().toUpperCase() : '';
  if (normalized === GATEWAY_SUCCESS_STATUS) return 'success';
  if (GATEWAY_FAILED_STATUSES.includes(normalized)) return 'failed';
  return 'pending';
}

/** Au-delà de cette durée, une transaction PENDING est PRÉSENTÉE comme expirée (rien n'est modifié en base). */
export const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Vrai si une transaction créée à `createdAt` dépasse la durée d'attente maximale. Date invalide : faux. */
export function isPendingExpired(createdAt: Date | string | number | null | undefined, now: number = Date.now()): boolean {
  if (createdAt === null || createdAt === undefined) return false;
  const created = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created > PENDING_EXPIRY_MS;
}

/** Statut à présenter au client : PENDING devient EXPIRED après 24 h ; les autres statuts sont inchangés. */
export function presentedStatus(
  status: string,
  createdAt: Date | string | number | null | undefined,
  now: number = Date.now()
): string {
  return status === 'PENDING' && isPendingExpired(createdAt, now) ? 'EXPIRED' : status;
}
