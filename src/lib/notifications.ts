const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_MESSAGES_PER_REQUEST = 100; // limite imposée par l'API Expo

const EXPO_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[^\]\s]+\]$/;
const LEGACY_TOKEN_RE = /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i;

type ExpoErrorDetails = { error?: string };
type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: ExpoErrorDetails };
type ExpoReceipt =
  | { status: 'ok' }
  | { status: 'error'; message?: string; details?: ExpoErrorDetails };

export interface PushResult {
  /** Messages acceptés par Expo (ticket « ok »). */
  sent: number;
  /** Messages refusés, jetons invalides ou erreur réseau. */
  failed: number;
  /** Jetons à supprimer en base (DeviceNotRegistered, format invalide). */
  invalidTokens: string[];
  /** Identifiants de tickets, à passer à checkPushReceipts() quelques minutes plus tard. */
  ticketIds: string[];
}

/** Vrai pour un jeton Expo réel ; rejette notamment les jetons factices « WEB-… ». */
export function isValidPushToken(token: unknown): token is string {
  return typeof token === 'string' && (EXPO_TOKEN_RE.test(token) || LEGACY_TOKEN_RE.test(token));
}

async function postJson(url: string, payload: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Expo HTTP ${res.status}`);
  return res.json();
}

/**
 * Envoie une notification à plusieurs appareils (paquets de 100, un échec de paquet
 * n'empêche pas les suivants). Ne lève jamais : le résultat décrit ce qui s'est passé.
 */
export async function sendPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, invalidTokens: [], ticketIds: [] };

  const unique = [...new Set(tokens)];
  const valid = unique.filter(isValidPushToken);
  for (const token of unique) {
    if (!isValidPushToken(token)) {
      result.failed += 1;
      result.invalidTokens.push(token);
    }
  }

  for (let i = 0; i < valid.length; i += MAX_MESSAGES_PER_REQUEST) {
    const batch = valid.slice(i, i + MAX_MESSAGES_PER_REQUEST);
    const messages = batch.map((to) => ({ to, sound: 'default', title, body, data }));

    try {
      const json = (await postJson(EXPO_PUSH_URL, messages)) as { data?: ExpoTicket | ExpoTicket[] };
      const raw = json?.data;
      const tickets = Array.isArray(raw) ? raw : raw ? [raw] : [];

      batch.forEach((token, index) => {
        const ticket = tickets[index];
        if (ticket?.status === 'ok') {
          result.sent += 1;
          result.ticketIds.push(ticket.id);
          return;
        }
        result.failed += 1;
        const code = ticket?.status === 'error' ? ticket.details?.error : undefined;
        if (code === 'DeviceNotRegistered') result.invalidTokens.push(token);
        console.warn('[push] ticket en erreur :', code ?? ticket?.status ?? 'réponse incomplète');
      });
    } catch (error) {
      result.failed += batch.length;
      console.error('[push] envoi impossible :', error instanceof Error ? error.message : 'erreur inconnue');
    }
  }

  return result;
}

/** Envoie une notification à un seul appareil (voir sendPushNotifications). */
export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<PushResult> {
  return sendPushNotifications([expoPushToken], title, body, data);
}

/**
 * Vérifie les reçus de livraison Expo (disponibles environ 15 minutes après l'envoi).
 * À appeler depuis une tâche différée avec les `ticketIds` renvoyés à l'envoi.
 */
export async function checkPushReceipts(
  ticketIds: string[],
): Promise<{ delivered: number; errors: { id: string; error: string }[] }> {
  const outcome = { delivered: 0, errors: [] as { id: string; error: string }[] };

  for (let i = 0; i < ticketIds.length; i += 300) {
    const ids = ticketIds.slice(i, i + 300);
    try {
      const json = (await postJson(EXPO_RECEIPTS_URL, { ids })) as { data?: Record<string, ExpoReceipt> };
      for (const [id, receipt] of Object.entries(json?.data ?? {})) {
        if (receipt.status === 'ok') {
          outcome.delivered += 1;
        } else {
          outcome.errors.push({ id, error: receipt.details?.error ?? receipt.message ?? 'unknown' });
        }
      }
    } catch (error) {
      console.error('[push] vérification des reçus impossible :', error instanceof Error ? error.message : 'erreur inconnue');
    }
  }

  return outcome;
}
