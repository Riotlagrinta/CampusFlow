import axios from 'axios';

/** Code HTTP de la réponse, ou undefined si ce n'est pas une erreur HTTP (réseau, délai...). */
export function getErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/** Vrai quand le serveur n'a pas répondu (hors-ligne, délai dépassé, DNS...). */
export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

/** Vrai quand le serveur indique que le quota IA est épuisé (429 + quotaExceeded). */
export function isQuotaExceeded(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 429) return false;
  const data: unknown = error.response.data;
  return !!data && typeof data === 'object' && (data as { quotaExceeded?: unknown }).quotaExceeded === true;
}

/** Vrai quand le serveur refuse un paiement car l'interrupteur des paiements est fermé (503 + code payments_disabled). */
export function isPaymentsDisabled(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 503) return false;
  const data: unknown = error.response.data;
  return !!data && typeof data === 'object' && (data as { code?: unknown }).code === 'payments_disabled';
}

/**
 * Vrai quand le serveur exige une vérification anti-robot (400 + code captcha_required). Le CAPTCHA
 * ne peut être affiché que dans un navigateur : l'application renvoie alors vers le site web.
 */
export function isCaptchaRequired(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) return false;
  const data: unknown = error.response.data;
  return !!data && typeof data === 'object' && (data as { code?: unknown }).code === 'captcha_required';
}

/** Délai d'attente (en secondes) demandé par le serveur via l'en-tête Retry-After (429). */
export function getRetryAfterSeconds(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const raw: unknown = error.response?.headers?.['retry-after'];
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function formatWait(seconds: number): string {
  if (seconds >= 120) return `${Math.ceil(seconds / 60)} minutes`;
  if (seconds >= 60) return '1 minute';
  return `${Math.ceil(seconds)} secondes`;
}

/**
 * Message affichable à l'utilisateur. Le serveur renvoie `{ error: string }` ;
 * `reply` est le format historique de /api/chat. On ne montre jamais le texte
 * brut d'une exception inattendue.
 */
export function getErrorMessage(error: unknown, fallback = 'Une erreur est survenue.'): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
        ? 'Le serveur met trop de temps à répondre. Réessayez.'
        : 'Impossible de contacter le serveur. Vérifiez votre connexion.';
    }

    // Trop de tentatives : on indique combien de temps attendre.
    if (error.response.status === 429) {
      const wait = getRetryAfterSeconds(error);
      if (wait) return `Trop de tentatives. Réessayez dans ${formatWait(wait)}.`;
    }

    const data: unknown = error.response.data;
    if (data && typeof data === 'object') {
      const body = data as { error?: unknown; reply?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) return body.error;
      if (typeof body.reply === 'string' && body.reply.trim()) return body.reply;
    }

    const status = error.response.status;
    if (status === 429) return 'Trop de tentatives. Réessayez dans quelques instants.';
    if (status >= 500) return 'Erreur du serveur. Réessayez plus tard.';
  }

  return fallback;
}

/**
 * Journalisation sûre : une erreur axios embarque la requête complète, y compris
 * l'en-tête Authorization (le jeton). On ne journalise donc que le message.
 */
export function logError(context: string, error: unknown): void {
  if (!__DEV__) return;
  const status = getErrorStatus(error);
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`[${context}]${status ? ` HTTP ${status}` : ''} ${detail}`);
}
