import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isPremium } from "@/lib/subscription";
import {
  checkLimits,
  clientIp,
  identifierKey,
  identifierSchema,
  identifierWhere,
  rateKey,
  verifyPassword,
} from "@/lib/authHelpers";

// Codes lisibles côté client (signIn(..., { redirect: false }) renvoie result.code).
class InactiveAccountError extends CredentialsSignin {
  code = "account_inactive";
}

class TooManyAttemptsError extends CredentialsSignin {
  code = "too_many_attempts";
}

// Les valeurs doivent être des chaînes : aucun objet ne peut atteindre Prisma.
const credentialsSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1).max(200),
});

// Extend the built-in types
declare module "next-auth" {
  interface User {
    id?: string;
    role: string;
    isSubscribed: boolean;
    subscriptionExpiresAt: Date | null;
  }

  interface Session {
    user: {
      id: string;
      role: string;
      isSubscribed: boolean;
      subscriptionExpiresAt: Date | null;
    } & DefaultSession["user"];
    // Instant de connexion (secondes Unix), lu par getAuthUser pour révoquer les sessions
    // ouvertes avant un changement de mot de passe. Absent des sessions antérieures à ce champ.
    authTime?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    isSubscribed: boolean;
    subscriptionExpiresAt: Date | null;
    authTime?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email ou téléphone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        // `email` reste accepté comme ancien nom du champ.
        const raw = (credentials ?? {}) as Record<string, unknown>;
        const parsed = credentialsSchema.safeParse({
          identifier: raw.identifier ?? raw.email,
          password: raw.password,
        });
        if (!parsed.success) return null;
        const { identifier, password } = parsed.data;

        // Même clés que /api/auth/login : web et mobile partagent le même budget d'essais.
        const limit = await checkLimits([
          { key: rateKey("login:ip", clientIp(request)), limit: 30, windowMs: 10 * 60 * 1000 },
          { key: rateKey("login:id", identifierKey(identifier)), limit: 8, windowMs: 10 * 60 * 1000 },
        ]);
        if (!limit.allowed) throw new TooManyAttemptsError();

        const user = await prisma.user.findFirst({ where: identifierWhere(identifier) });

        // Le mot de passe est vérifié en premier : un compte inactif n'est révélé qu'à
        // celui qui en connaît le mot de passe.
        const passwordMatch = await verifyPassword(password, user?.password);
        if (!user || !passwordMatch) return null;

        if (!user.isActive) throw new InactiveAccountError();

        return {
          id: user.id,
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(" "),
          role: user.role,
          isSubscribed: isPremium(user),
          subscriptionExpiresAt: user.subscriptionExpiresAt,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id as string;
        token.isSubscribed = user.isSubscribed;
        token.subscriptionExpiresAt = user.subscriptionExpiresAt;
        // Fixé une seule fois, à la connexion. On n'utilise pas `token.iat` : Auth.js le réécrit à
        // chaque renouvellement du cookie (jwt.encode appelle setIssuedAt), donc une session volée
        // pourrait obtenir un `iat` récent après un changement de mot de passe en se rafraîchissant.
        token.authTime = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    async session({ session, token }) {
      session.authTime = token.authTime;
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.isSubscribed = token.isSubscribed as boolean;
        session.user.subscriptionExpiresAt = token.subscriptionExpiresAt as Date | null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
