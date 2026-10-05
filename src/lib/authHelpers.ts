import { createHash, randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { checkRateLimitDb } from '@/lib/rateLimit';

// Helpers partagés par les routes de comptes (login, register, OTP, reset, mot de passe).

export const BCRYPT_COST = 12;
export const MAX_OTP_ATTEMPTS = 5;
export const REFERRAL_BONUS = 5;

// Plafond de bonus de parrainage : un parrain ne reçoit les +REFERRAL_BONUS jetons que pour ses
// MAX_REFERRAL_BONUSES premiers filleuls activés. Au-delà, ses filleuls reçoivent toujours leur
// propre bonus, mais le parrain ne gagne plus rien (les jetons se vendent : sans plafond, créer
// des comptes jetables pour se parrainer serait rentable).
export const MAX_REFERRAL_BONUSES = 20;

// `identifier` = email OU téléphone. Toujours une chaîne : un objet (ex. { startsWith: "" })
// ne doit jamais atteindre Prisma.
export const identifierSchema = z
  .string({ error: 'Email ou téléphone requis' })
  .trim()
  .min(3, 'Email ou téléphone requis')
  .max(100, 'Email ou téléphone trop long');

export const otpCodeSchema = z
  .string({ error: 'Code à 6 chiffres requis' })
  .trim()
  .regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres');

// bcrypt ignore tout ce qui dépasse 72 octets : on le refuse plutôt que de tronquer en silence.
export const passwordSchema = z
  .string({ error: 'Mot de passe requis' })
  .min(8, 'Mot de passe trop court (minimum 8 caractères)')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Mot de passe trop long (72 octets maximum)');

// Prénom / nom : insérés tels quels dans des messages WhatsApp et des emails envoyés depuis les
// canaux officiels (« Bonjour <prénom> ! »). Lettres Unicode (accents inclus), marques combinantes,
// espaces, apostrophes, points et tirets uniquement : ni chiffres, ni « : / @ < > », ni URL.
// Une suite « lettres.lettres » (au moins 2 de chaque côté du point : « evil.com ») est refusée, car
// WhatsApp et les messageries la transforment en lien cliquable ; les initiales (« J.-P. », « A. B. »)
// restent permises.
const PERSON_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’ .-]*$/u;
const DOMAIN_LIKE_PATTERN = /[\p{L}\p{M}]{2,}\.[\p{L}\p{M}]{2,}/u;

export const personNameSchema = (label = 'Nom') =>
  z
    .string({ error: `${label} requis` })
    .trim()
    .min(1, `${label} requis`)
    .max(50, `${label} trop long (50 caractères maximum)`)
    .regex(
      PERSON_NAME_PATTERN,
      `${label} invalide : lettres, espaces, apostrophes et tirets uniquement (ni chiffres, ni liens ni symboles)`
    )
    .refine((value) => !DOMAIN_LIKE_PATTERN.test(value), `${label} invalide : une adresse ou un lien n'est pas un nom`);

// Comptes SYSTÈME : le code s'appuie sur leur existence et leur état (inactif, mot de passe
// inutilisable). Ne jamais les laisser s'inscrire ni être « réclamés » comme une pré-inscription expirée.
//  - ai-tutor@defitech.tg : auteur des réponses IA du forum (AI_TUTOR_EMAIL de src/lib/xp.ts) ;
//  - compte-supprime@studenthub.invalid : rattachement des contenus des comptes supprimés
//    (DELETED_USER_EMAIL de src/app/api/admin/users/[id]/route.ts).
// Valeurs dupliquées volontairement : xp.ts importe Prisma, ce module doit rester léger.
export const SYSTEM_ACCOUNT_EMAILS: readonly string[] = [
  'ai-tutor@defitech.tg',
  'compte-supprime@studenthub.invalid',
];

// Noms sensibles du domaine de l'organisation (usurpation d'un expéditeur/administrateur officiel).
const RESERVED_DOMAIN = 'defitech.tg';
const RESERVED_LOCAL_PARTS: readonly string[] = ['admin', 'support', 'noreply'];

/**
 * Vrai pour une adresse que personne ne peut utiliser pour s'inscrire : tout domaine « .invalid »
 * (TLD réservé, jamais routable), les comptes système et quelques noms réservés du domaine de
 * l'organisation (admin@, support@, noreply@, y compris avec un « +étiquette »). Insensible à la
 * casse et aux espaces.
 */
export function isReservedEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  const value = email.trim().toLowerCase();
  if (SYSTEM_ACCOUNT_EMAILS.includes(value)) return true;

  const at = value.lastIndexOf('@');
  if (at === -1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).replace(/\.+$/, '');

  if (domain === 'invalid' || domain.endsWith('.invalid')) return true;
  if (domain === RESERVED_DOMAIN) {
    const base = local.split('+')[0];
    return RESERVED_LOCAL_PARTS.includes(base);
  }
  return false;
}

/**
 * L'identifiant porté par un jeton (cookie NextAuth ou JWT mobile) désigne-t-il un AUTRE compte
 * que celui trouvé en base ? Le compte est retrouvé par email : si un compte supprimé est recréé
 * avec le même email, l'ancien jeton ne doit pas ouvrir le nouveau compte.
 * Un identifiant absent (anciens jetons sans id) n'est pas un désaccord ; un identifiant présent
 * qui n'est pas une chaîne égale à `userId` en est un.
 */
export function isTokenIdMismatch(userId: string, ...tokenIds: unknown[]): boolean {
  return tokenIds.some((tokenId) => {
    if (tokenId === undefined || tokenId === null || tokenId === '') return false;
    return typeof tokenId !== 'string' || tokenId !== userId;
  });
}

export function firstIssue(error: z.ZodError, fallback = 'Données invalides'): string {
  return error.issues[0]?.message || fallback;
}

// Numéro au format international sans « + » ni séparateurs (ex. 22890000000).
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidPhone(digits: string): boolean {
  return /^\d{8,15}$/.test(digits);
}

// Critère de recherche d'un compte par email ou téléphone. Les emails historiques ont pu
// être enregistrés avec une casse quelconque, les téléphones avec ou sans « + ».
export function identifierWhere(identifier: string): Prisma.UserWhereInput {
  const id = identifier.trim();

  if (id.includes('@')) {
    const lower = id.toLowerCase();
    return { OR: lower === id ? [{ email: id }] : [{ email: id }, { email: lower }] };
  }

  const digits = normalizePhone(id);
  const variants = new Set([id, digits, `+${digits}`].filter((v) => v.length >= 3));
  return { OR: [...variants].map((phone) => ({ phone })) };
}

// Forme canonique d'un identifiant, utilisée pour les clés de rate limit.
export function identifierKey(identifier: string): string {
  const id = identifier.trim();
  return id.includes('@') ? id.toLowerCase() : normalizePhone(id);
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}

// Clé de rate limit : la valeur (email, téléphone, IP) est hachée pour ne pas stocker de
// données personnelles en clair dans la table RateLimit.
export function rateKey(scope: string, value: string): string {
  return `${scope}:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

export type LimitCheck = { key: string; limit: number; windowMs: number };

// Applique plusieurs limites à la suite ; s'arrête à la première refusée.
export async function checkLimits(checks: LimitCheck[]): Promise<{ allowed: boolean; retryAfterMs: number }> {
  for (const { key, limit, windowMs } of checks) {
    const result = await checkRateLimitDb(key, limit, windowMs);
    if (!result.allowed) return result;
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function tooManyRequests(
  retryAfterMs: number,
  message = 'Trop de tentatives. Veuillez réessayer plus tard.'
): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } }
  );
}

// Code à 6 chiffres (zéros initiaux conservés), tiré avec un générateur cryptographique.
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

let dummyHash: Promise<string> | null = null;

// Compare toujours un hash, même si le compte n'existe pas : le temps de réponse ne révèle
// pas l'existence de l'identifiant. Le hash factice a le MÊME coût que les vrais hash
// (BCRYPT_COST) : avec un coût inférieur, la réponse « compte inconnu » serait ~4 fois plus rapide.
export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    dummyHash ??= bcrypt.hash('mot-de-passe-factice', BCRYPT_COST);
    await bcrypt.compare(plain, await dummyHash);
    return false;
  }
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

// Révocation des sessions au changement de mot de passe. `issuedAtSeconds` est l'instant (en
// secondes Unix) où la session a été ouverte : `iat` du JWT mobile, `authTime` du cookie NextAuth.
// Comparaison EN SECONDES : un jeton émis dans la même seconde que le changement est accepté
// (sinon une connexion juste après une réinitialisation serait refusée).
// - `passwordChangedAt` absent : jamais changé, aucun contrôle (sessions existantes inchangées).
// - date d'émission absente ou illisible alors que le mot de passe a changé : refusé (la session
//   ne peut pas prouver qu'elle date d'après le changement).
export function isIssuedBeforePasswordChange(
  issuedAtSeconds: number | null | undefined,
  passwordChangedAt: Date | null | undefined
): boolean {
  if (!passwordChangedAt) return false;
  const changedAtSeconds = Math.floor(passwordChangedAt.getTime() / 1000);
  if (Number.isNaN(changedAtSeconds)) return false;
  if (typeof issuedAtSeconds !== 'number' || !Number.isFinite(issuedAtSeconds)) return true;
  return issuedAtSeconds < changedAtSeconds;
}
