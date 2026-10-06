import { auth } from "@/../auth";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { isIssuedBeforePasswordChange, isTokenIdMismatch } from "@/lib/authHelpers";
import {
  adminMfaDecision,
  mfaCookieNames,
  mfaMode,
  proofMatches,
  readCookieValue,
  verifyMfaProof,
  type MfaMode,
} from "@/lib/mfa/proof";

/**
 * `role` est le rôle EFFECTIF : un ADMIN dont le second facteur n'est pas validé dans cette session
 * y apparaît comme « STUDENT » (et `mfaPending` est vrai). Toutes les routes qui testent
 * `user.role === 'ADMIN'` en profitent sans rien changer ; ne jamais relire le rôle en base pour
 * décider d'un droit.
 */
export type AuthUser = { id: string; email: string; role: string; mfaPending?: boolean };

// `tokenIds` : identifiants de compte portés par le jeton (cookie : user.id ; Bearer : id et sub).
// Vide ou absents pour les anciens jetons, qui restent acceptés.
type Identity = { email: string; issuedAt: number | undefined; tokenIds: unknown[] };

function getSecretKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

// Identification mobile : JWT HS256 émis par /api/auth/login, signé avec AUTH_SECRET.
// `iat` (secondes) sert à refuser un jeton émis avant le dernier changement de mot de passe.
async function identityFromBearer(req?: Request): Promise<Identity | null> {
  const header = req?.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const key = getSecretKey();
  if (!key) return null;

  try {
    const { payload } = await jwtVerify(header.slice(7), key, { algorithms: ["HS256"] });
    if (typeof payload.email !== "string") return null;
    return { email: payload.email, issuedAt: payload.iat, tokenIds: [payload.id, payload.sub] };
  } catch {
    return null;
  }
}

/** Compte et session validés (rôle EN BASE, avant toute règle de second facteur). */
export type SessionContext = {
  user: {
    id: string;
    email: string;
    role: string;
    passwordChangedAt: Date | null;
    mfaEnabledAt: Date | null;
  };
  source: "cookie" | "bearer";
  /** Instant de connexion (secondes Unix) de la session web ; absent en Bearer. */
  authTime: number | undefined;
};

/**
 * Identité de l'appelant : cookie de session NextAuth (web) ou Bearer JWT (mobile).
 * Le rôle et l'état du compte sont relus en base : un changement de rôle ou une
 * désactivation prend effet immédiatement, sans attendre l'expiration du JWT.
 * Un changement de mot de passe (`passwordChangedAt`) révoque aussi toutes les sessions
 * ouvertes avant lui, et un jeton dont l'identifiant de compte ne correspond pas à celui trouvé
 * en base (compte supprimé puis recréé avec le même email) est refusé.
 */
export async function resolveSession(req?: Request): Promise<SessionContext | null> {
  const session = await auth();
  // Pour le cookie, on utilise `authTime` (fixé à la connexion, voir auth.ts) et non l'`iat` du
  // JWT NextAuth : celui-ci est réécrit à chaque renouvellement du cookie, ce qui permettrait à
  // une session volée de se « rafraîchir » après le changement de mot de passe.
  const fromCookie = !!session?.user?.email;
  const identity: Identity | null = session?.user?.email
    ? { email: session.user.email, issuedAt: session.authTime, tokenIds: [session.user.id] }
    : await identityFromBearer(req);
  if (!identity) return null;

  const user = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true, email: true, role: true, isActive: true, passwordChangedAt: true, mfaEnabledAt: true },
  });
  if (!user || !user.isActive) return null;
  // Le compte est retrouvé par email : un jeton émis pour un compte supprimé puis recréé avec le
  // même email porte l'ancien identifiant et ne doit pas ouvrir le nouveau compte.
  if (isTokenIdMismatch(user.id, ...identity.tokenIds)) return null;
  if (isIssuedBeforePasswordChange(identity.issuedAt, user.passwordChangedAt)) return null;

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      passwordChangedAt: user.passwordChangedAt,
      mfaEnabledAt: user.mfaEnabledAt,
    },
    source: fromCookie ? "cookie" : "bearer",
    authTime: fromCookie ? session?.authTime : undefined,
  };
}

// Cookie de preuve du second facteur : dans la requête si on l'a, sinon dans le contexte Next.js
// (composants serveur). Jamais d'exception : une lecture impossible vaut « pas de preuve ».
async function readProofCookie(req?: Request): Promise<string | null> {
  if (req) return readCookieValue(req.headers.get("cookie"), mfaCookieNames());
  try {
    const jar = await cookies();
    for (const name of mfaCookieNames()) {
      const value = jar.get(name)?.value;
      if (value) return value;
    }
  } catch {
    // hors contexte de requête
  }
  return null;
}

/** Le second facteur a-t-il été validé dans CETTE session web de ce compte ? */
export async function hasValidMfaProof(ctx: SessionContext, req?: Request): Promise<boolean> {
  if (ctx.source !== "cookie") return false;
  const claims = await verifyMfaProof(await readProofCookie(req), getSecretKey());
  return proofMatches(claims, {
    userId: ctx.user.id,
    authTime: ctx.authTime,
    enabledAtMs: ctx.user.mfaEnabledAt ? ctx.user.mfaEnabledAt.getTime() : null,
  });
}

/**
 * Mode du second facteur pour CE compte. Un ADMIN déjà inscrit ne perd JAMAIS l'exigence parce que la
 * clé manque : sans `MFA_ENCRYPTION_KEY` (déploiement Preview qui ne l'a pas, variable supprimée ou mal
 * nommée) on ne peut pas vérifier son code, donc refus (mode « invalid ») plutôt qu'accès sur mot de
 * passe seul. Pour désactiver la fonction volontairement, réinitialiser le second facteur des
 * administrateurs en SQL (voir scripts/sql/2026-10-double-authentification.sql), puis retirer la clé.
 */
export function effectiveMfaMode(ctx: { user: { role: string; mfaEnabledAt: Date | null } }): MfaMode {
  const mode = mfaMode();
  if (mode === "off" && ctx.user.role === "ADMIN" && ctx.user.mfaEnabledAt !== null) return "invalid";
  return mode;
}

/**
 * Identité effective de l'appelant (voir AuthUser). Un ADMIN sans second facteur validé est traité
 * comme un étudiant : aucune route d'administration ni droit élargi ne lui est accessible tant qu'il
 * n'a pas saisi son code (page /mfa).
 */
export async function getAuthUser(req?: Request): Promise<AuthUser | null> {
  const ctx = await resolveSession(req);
  if (!ctx) return null;

  const mode: MfaMode = effectiveMfaMode(ctx);
  const needsProof = ctx.user.role === "ADMIN" && mode === "on" && ctx.source === "cookie";
  const proofOk = needsProof ? await hasValidMfaProof(ctx, req) : false;

  const decision = adminMfaDecision({ mode, role: ctx.user.role, source: ctx.source, proofOk });
  if (decision === "downgrade") {
    return { id: ctx.user.id, email: ctx.user.email, role: "STUDENT", mfaPending: true };
  }
  return { id: ctx.user.id, email: ctx.user.email, role: ctx.user.role };
}

export async function requireAdmin(req?: Request): Promise<AuthUser | null> {
  const user = await getAuthUser(req);
  return user && user.role === "ADMIN" ? user : null;
}
