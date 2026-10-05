import { auth } from "@/../auth";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { isIssuedBeforePasswordChange, isTokenIdMismatch } from "@/lib/authHelpers";

export type AuthUser = { id: string; email: string; role: string };

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

/**
 * Identité de l'appelant : cookie de session NextAuth (web) ou Bearer JWT (mobile).
 * Le rôle et l'état du compte sont relus en base : un changement de rôle ou une
 * désactivation prend effet immédiatement, sans attendre l'expiration du JWT.
 * Un changement de mot de passe (`passwordChangedAt`) révoque aussi toutes les sessions
 * ouvertes avant lui, et un jeton dont l'identifiant de compte ne correspond pas à celui trouvé
 * en base (compte supprimé puis recréé avec le même email) est refusé.
 */
export async function getAuthUser(req?: Request): Promise<AuthUser | null> {
  const session = await auth();
  // Pour le cookie, on utilise `authTime` (fixé à la connexion, voir auth.ts) et non l'`iat` du
  // JWT NextAuth : celui-ci est réécrit à chaque renouvellement du cookie, ce qui permettrait à
  // une session volée de se « rafraîchir » après le changement de mot de passe.
  const identity: Identity | null = session?.user?.email
    ? { email: session.user.email, issuedAt: session.authTime, tokenIds: [session.user.id] }
    : await identityFromBearer(req);
  if (!identity) return null;

  const user = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true, email: true, role: true, isActive: true, passwordChangedAt: true },
  });
  if (!user || !user.isActive) return null;
  // Le compte est retrouvé par email : un jeton émis pour un compte supprimé puis recréé avec le
  // même email porte l'ancien identifiant et ne doit pas ouvrir le nouveau compte.
  if (isTokenIdMismatch(user.id, ...identity.tokenIds)) return null;
  if (isIssuedBeforePasswordChange(identity.issuedAt, user.passwordChangedAt)) return null;

  return { id: user.id, email: user.email, role: user.role };
}

export async function requireAdmin(req?: Request): Promise<AuthUser | null> {
  const user = await getAuthUser(req);
  return user && user.role === "ADMIN" ? user : null;
}
