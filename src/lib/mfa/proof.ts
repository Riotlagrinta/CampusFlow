import { SignJWT, jwtVerify } from 'jose';
import { deriveKey, readMfaKey } from '@/lib/mfa/crypto';

// « Preuve » qu'un second facteur a été validé pour CETTE session. Jeton HS256 (jose) signé avec
// AUTH_SECRET, posé dans un cookie HttpOnly séparé du cookie de session NextAuth.
//
// Liée à trois choses, pour qu'elle ne serve à rien ailleurs :
//  - `sub` : le compte ;
//  - `at`  : l'instant de connexion de la session (`authTime`) : une nouvelle connexion exige un
//            nouveau code, et la preuve d'une session ne vaut pas pour une autre ;
//  - `ea`  : la date d'activation du second facteur du compte (`mfaEnabledAt`) : la réinitialiser
//            ou le refaire invalide toutes les preuves déjà émises.
// Clé de signature : une sous-clé HKDF dédiée dérivée d'AUTH_SECRET, et non AUTH_SECRET elle-même. Un
// jeton Bearer mobile (signé avec AUTH_SECRET) ne peut donc jamais être accepté comme preuve, même si
// quelqu'un lui donnait les bons claims ; `typ` et l'absence de claim `email` ajoutent deux barrières.

export const MFA_COOKIE_SECURE = '__Host-sh_mfa';
export const MFA_COOKIE_PLAIN = 'sh_mfa';
export const MFA_COOKIE_NAMES = [MFA_COOKIE_SECURE, MFA_COOKIE_PLAIN] as const;

/**
 * Nom(s) de cookie à LIRE. En production seul le nom `__Host-` est lu : le navigateur interdit à un
 * sous-domaine de le poser, alors qu'il pourrait poser un cookie `sh_mfa` ordinaire (cookie tossing).
 */
export function mfaCookieNames(secure: boolean = process.env.NODE_ENV === 'production'): string[] {
  return [secure ? MFA_COOKIE_SECURE : MFA_COOKIE_PLAIN];
}
export const MFA_PROOF_TTL_SECONDS = 12 * 60 * 60;

export type MfaProofClaims = { sub: string; at: number; ea: number };
export type MfaMode = 'off' | 'on' | 'invalid';

/** off : fonctionnalité désactivée ; on : appliquée aux ADMIN ; invalid : clé mal formée (refus). */
export function mfaMode(raw: string | undefined = process.env.MFA_ENCRYPTION_KEY): MfaMode {
  const state = readMfaKey(raw);
  return state.state === 'ok' ? 'on' : state.state;
}

export async function signMfaProof(claims: MfaProofClaims, secret: Uint8Array, nowSeconds?: number): Promise<string> {
  const iat = nowSeconds ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ typ: 'mfa-proof', at: claims.at, ea: claims.ea })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + MFA_PROOF_TTL_SECONDS)
    .sign(deriveKey(secret, 'mfa-proof'));
}

export async function verifyMfaProof(
  token: string | null | undefined,
  secret: Uint8Array | null
): Promise<MfaProofClaims | null> {
  if (!token || !secret) return null;
  try {
    // `exp` et `sub` obligatoires : un jeton sans expiration n'est jamais accepté.
    const { payload } = await jwtVerify(token, deriveKey(secret, 'mfa-proof'), {
      algorithms: ['HS256'],
      requiredClaims: ['exp', 'sub'],
    });
    if (payload.typ !== 'mfa-proof') return null;
    if (typeof payload.sub !== 'string' || typeof payload.at !== 'number' || typeof payload.ea !== 'number') return null;
    return { sub: payload.sub, at: payload.at, ea: payload.ea };
  } catch {
    return null;
  }
}

/**
 * La preuve vaut-elle pour cette session de ce compte ? `enabledAtMs` : mfaEnabledAt de la base
 * (null = pas encore de second facteur actif -> aucune preuve ne peut valoir). `checkEnabledAt`
 * est faux dans le proxy, qui n'a pas accès à la base ; getAuthUser, lui, le vérifie toujours.
 */
export function proofMatches(
  claims: MfaProofClaims | null,
  expected: { userId: string; authTime: number | undefined; enabledAtMs: number | null },
  checkEnabledAt = true
): boolean {
  if (!claims) return false;
  if (claims.sub !== expected.userId) return false;
  if (typeof expected.authTime !== 'number' || claims.at !== expected.authTime) return false;
  if (checkEnabledAt) {
    if (expected.enabledAtMs === null) return false;
    if (claims.ea !== expected.enabledAtMs) return false;
  }
  return true;
}

/** Valeur d'un cookie dans un en-tête `Cookie`, en essayant les noms dans l'ordre. */
export function readCookieValue(cookieHeader: string | null | undefined, names: readonly string[]): string | null {
  if (!cookieHeader) return null;
  const jar = new Map<string, string>();
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!jar.has(name)) jar.set(name, part.slice(index + 1).trim());
  }
  for (const name of names) {
    const value = jar.get(name);
    if (value) return value;
  }
  return null;
}

/** Nom et options du cookie : le préfixe `__Host-` exige HTTPS (Secure, Path=/, sans Domain). */
export function mfaCookieSettings(secure: boolean) {
  return {
    name: secure ? MFA_COOKIE_SECURE : MFA_COOKIE_PLAIN,
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: MFA_PROOF_TTL_SECONDS,
    },
  };
}

/**
 * Règle centrale : un ADMIN garde ses droits seulement s'il a validé son second facteur dans cette
 * session WEB. Mobile (Bearer) : jamais de second facteur, donc un ADMIN y est un simple étudiant.
 * Clé mal formée : refus pour tous les ADMIN (fail-closed) ; clé absente : fonction désactivée.
 */
export function adminMfaDecision(input: {
  mode: MfaMode;
  role: string;
  source: 'cookie' | 'bearer';
  proofOk: boolean;
}): 'keep' | 'downgrade' {
  if (input.role !== 'ADMIN') return 'keep';
  if (input.mode === 'off') return 'keep';
  if (input.mode === 'invalid') return 'downgrade';
  if (input.source === 'bearer') return 'downgrade';
  return input.proofOk ? 'keep' : 'downgrade';
}
