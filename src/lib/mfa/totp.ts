import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// TOTP (RFC 6238) avec HMAC-SHA1, pas de 30 s et 6 chiffres : le profil que tous les
// authentificateurs (Google Authenticator, Aegis, Microsoft Authenticator, 1Password...) acceptent.
// Module pur : aucun accès base ni réseau, testable avec les vecteurs de la RFC.

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Tolérance d'horloge : le pas courant et un pas avant/après (±30 s). */
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Décode du base32 (casse, espaces, tirets et « = » ignorés). Lève une erreur si un caractère est invalide. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('base32 invalide');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secret de 160 bits (la taille recommandée par la RFC 4226), en base32 sans remplissage (32 caractères). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(key: Buffer, counter: number, digits: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totpStep(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);
}

/** Code attendu à l'instant donné (utilisé par les tests ; la vérification passe par verifyTotp). */
export function totpAt(secretBase32: string, timeMs: number, digits = TOTP_DIGITS): string {
  return hotp(base32Decode(secretBase32), totpStep(timeMs), digits);
}

/** « 123 456 » ou « 123456 » -> « 123456 » ; null si ce n'est pas exactement 6 chiffres. */
export function normalizeTotpCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/\s/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

/**
 * Vérifie un code et renvoie le PAS qui correspond (pour l'anti-rejeu), ou null.
 * `afterStep` : un pas déjà consommé (ou antérieur) est refusé, donc un code intercepté ne peut
 * pas être rejoué. Tous les pas de la fenêtre sont comparés sans sortie anticipée, en temps constant.
 */
export function verifyTotp(
  secretBase32: string,
  rawCode: unknown,
  nowMs: number,
  options: { afterStep?: number | null; window?: number } = {}
): number | null {
  const code = normalizeTotpCode(rawCode);
  if (!code) return null;

  let key: Buffer;
  try {
    key = base32Decode(secretBase32);
  } catch {
    return null;
  }

  const window = options.window ?? TOTP_WINDOW;
  const current = totpStep(nowMs);
  const given = Buffer.from(code);
  let matched: number | null = null;

  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    const expected = Buffer.from(hotp(key, step, TOTP_DIGITS));
    const equal = timingSafeEqual(given, expected);
    const fresh = options.afterStep == null || step > options.afterStep;
    if (equal && fresh && matched === null) matched = step;
  }
  return matched;
}

/** URI `otpauth://` lue par les authentificateurs (lien cliquable ou QR). */
export function buildOtpauthUrl(params: { issuer: string; account: string; secretBase32: string }): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`;
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** Secret affiché par groupes de 4 caractères, pour la saisie manuelle. */
export function formatSecretForDisplay(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, '$1 ').trim();
}
