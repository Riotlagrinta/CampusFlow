import { isIP } from 'net';

// Vérification anti-robot (Cloudflare Turnstile) des routes qui ENVOIENT UN EMAIL à une adresse
// choisie par l'appelant : inscription et « mot de passe oublié ». Sans elle, un robot distribué
// peut épuiser le quota quotidien de Gmail (environ 500 messages) et bloquer tous les codes.
//
// Active seulement si TURNSTILE_SECRET_KEY (serveur) ET NEXT_PUBLIC_TURNSTILE_SITE_KEY (navigateur)
// sont définies : sans elles, rien n'est exigé (développement, ou avant la création des clés).
// Une fois active, la vérification échoue FERMÉE : si Cloudflare est injoignable, la requête est
// refusée (503) plutôt que de laisser passer les robots.

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TOKEN_MAX_LENGTH = 2048;
const DEFAULT_TIMEOUT_MS = 5000;

type Env = Record<string, string | undefined>;

export function isCaptchaEnabled(env: Env = process.env): boolean {
  return !!env.TURNSTILE_SECRET_KEY?.trim() && !!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
}

export type CaptchaFailure = 'missing' | 'invalid' | 'unavailable';
export type CaptchaResult = { ok: true } | { ok: false; reason: CaptchaFailure };

function isRealIp(value: string | null): value is string {
  return !!value && isIP(value) !== 0;
}

// Journal des pannes (jamais la clé secrète ni le jeton) : sans cela, un secret mal collé dans Vercel
// bloque toutes les inscriptions sans laisser aucune trace.
function logUnavailable(reason: string): void {
  console.error(`[captcha] vérification impossible : ${reason}`);
}

/**
 * Valide un jeton Turnstile (usage unique : Cloudflare refuse un jeton déjà consommé).
 * `fetchImpl` et `env` sont injectables pour les tests.
 */
export async function verifyCaptcha(
  token: unknown,
  remoteIp: string | null,
  deps: { fetchImpl?: typeof fetch; env?: Env; timeoutMs?: number } = {}
): Promise<CaptchaResult> {
  const env = deps.env ?? process.env;
  if (!isCaptchaEnabled(env)) return { ok: true };

  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX_LENGTH) {
    return { ok: false, reason: 'missing' };
  }

  // Rogné comme à l'activation (isCaptchaEnabled) : un saut de ligne collé dans Vercel serait sinon refusé
  // par Cloudflare (invalid-input-secret) et bloquerait tout le monde.
  const body = new URLSearchParams({ secret: (env.TURNSTILE_SECRET_KEY as string).trim(), response: token });
  if (isRealIp(remoteIp)) body.set('remoteip', remoteIp);

  try {
    const res = await (deps.fetchImpl ?? fetch)(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      logUnavailable(`Cloudflare a répondu HTTP ${res.status}`);
      return { ok: false, reason: 'unavailable' };
    }

    const data = (await res.json().catch(() => null)) as { success?: unknown; 'error-codes'?: unknown } | null;
    if (!data) {
      logUnavailable('réponse de Cloudflare illisible');
      return { ok: false, reason: 'unavailable' };
    }
    if (data.success === true) return { ok: true };

    const codes = Array.isArray(data['error-codes']) ? (data['error-codes'] as unknown[]) : [];
    // « internal-error », une clé secrète refusée ou une requête mal formée sont des pannes de notre côté
    // (configuration, code), pas un robot : 503 et journal.
    const ours = ['internal-error', 'invalid-input-secret', 'missing-input-secret', 'bad-request'].filter((c) => codes.includes(c));
    if (ours.length > 0) {
      logUnavailable(`Cloudflare a refusé la requête (${ours.join(', ')}) : vérifier TURNSTILE_SECRET_KEY`);
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: false, reason: 'invalid' };
  } catch (error) {
    logUnavailable(error instanceof Error ? error.name : 'erreur réseau');
    return { ok: false, reason: 'unavailable' };
  }
}

/** Statut HTTP et corps JSON à renvoyer ; `code` permet à un client (web ou mobile) de réagir. */
export function captchaFailure(reason: CaptchaFailure): { status: number; body: { error: string; code: string } } {
  if (reason === 'unavailable') {
    return {
      status: 503,
      body: {
        error: 'La vérification anti-robot est momentanément indisponible. Réessayez dans un instant.',
        code: 'captcha_unavailable',
      },
    };
  }
  return {
    status: 400,
    body: {
      error: 'Vérification anti-robot requise ou expirée. Rechargez la page et réessayez.',
      code: 'captcha_required',
    },
  };
}
