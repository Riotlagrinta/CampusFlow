import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'crypto';

// Chiffrement du secret TOTP en base et codes de secours. Module pur (aucun accès base/réseau).
//
// Clé : MFA_ENCRYPTION_KEY = 32 octets en base64 (`openssl rand -base64 32`). Elle est
// VOLONTAIREMENT distincte de AUTH_SECRET : faire tourner AUTH_SECRET (déconnexion générale) ne
// doit pas rendre illisibles les secrets d'authentification des administrateurs.
//  - absente  : la double authentification est désactivée (développement), SAUF pour un ADMIN déjà
//               inscrit, qui est alors refusé (voir effectiveMfaMode dans src/lib/session.ts) ;
//  - invalide : état « invalid », traité en refus : aucun ADMIN n'obtient ses droits (fail-closed).
// Une même clé maître ne sert jamais à deux primitives : chaque usage a sa sous-clé HKDF (deriveKey).

export type MfaKeyState = { state: 'off' } | { state: 'invalid' } | { state: 'ok'; key: Buffer };

export function readMfaKey(raw: string | undefined = process.env.MFA_ENCRYPTION_KEY): MfaKeyState {
  const value = raw?.trim();
  if (!value) return { state: 'off' };

  // Base64 standard ou « URL-safe » ; exactement 32 octets (AES-256).
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return { state: 'invalid' };
  const key = Buffer.from(normalized, 'base64');
  if (key.length !== 32) return { state: 'invalid' };
  // Refuse une clé évidemment faible (32 octets nuls, un motif répété...) : un vrai tirage aléatoire
  // a presque toujours plus de 16 valeurs d'octet distinctes.
  if (new Set(key).size < 8) return { state: 'invalid' };
  return { state: 'ok', key };
}

/** Sous-clé de 32 octets dédiée à un usage (HKDF-SHA256) : `purpose` sépare chiffrement, empreintes, preuves. */
export function deriveKey(master: Uint8Array, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), `studenthub-mfa:${purpose}`, 32));
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/**
 * AES-256-GCM. `aad` (l'identifiant du compte) est authentifié mais non chiffré : un secret copié
 * vers la ligne d'un autre compte ne se déchiffre plus. Format : `v1.<iv>.<tag>.<texte chiffré>`.
 */
export function encryptSecret(plain: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(key, 'secret-encryption'), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', b64url(iv), b64url(cipher.getAuthTag()), b64url(encrypted)].join('.');
}

/** Texte en clair, ou null pour tout échec (mauvaise clé, donnée altérée, mauvais compte, format inconnu). */
export function decryptSecret(payload: string | null | undefined, key: Buffer, aad: string): string | null {
  if (!payload) return null;
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(key, 'secret-encryption'), iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// --- Codes de secours ---------------------------------------------------------------------------

// 31 symboles sans caractères ambigus (ni 0/O, ni 1/I/L) : 10 symboles ≈ 49,5 bits.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_COUNT = 8;
const RECOVERY_LENGTH = 10;

/** `XXXXX-XXXXX`, tirés avec un générateur cryptographique sans biais de modulo. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let raw = '';
    for (let i = 0; i < RECOVERY_LENGTH; i++) raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/** Forme canonique (majuscules, sans tiret ni espace), ou null si le format est impossible. */
export function normalizeRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.toUpperCase().replace(/[\s-]/g, '');
  if (value.length !== RECOVERY_LENGTH) return null;
  for (const char of value) if (!RECOVERY_ALPHABET.includes(char)) return null;
  return value;
}

/**
 * Empreinte HMAC-SHA256 (clé MFA) et non un simple SHA-256 : un code de secours n'a que ~49 bits,
 * qu'un attaquant ayant seulement la base de données pourrait énumérer hors ligne avec un hash nu.
 */
export function hashRecoveryCode(normalized: string, key: Buffer): string {
  return createHmac('sha256', deriveKey(key, 'recovery-code')).update(`recovery:${normalized}`).digest('hex');
}

/** Position de l'empreinte dans la liste, ou -1. Toute la liste est parcourue, en temps constant. */
export function findRecoveryIndex(hashes: string[], normalized: string, key: Buffer): number {
  const target = Buffer.from(hashRecoveryCode(normalized, key), 'hex');
  let found = -1;
  hashes.forEach((hash, index) => {
    const candidate = Buffer.from(hash, 'hex');
    if (candidate.length === target.length && timingSafeEqual(candidate, target) && found === -1) found = index;
  });
  return found;
}

/** Liste d'empreintes stockée en JSON ; toute valeur illisible donne une liste vide (aucun code valable). */
export function parseRecoveryHashes(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h)) : [];
  } catch {
    return [];
  }
}
