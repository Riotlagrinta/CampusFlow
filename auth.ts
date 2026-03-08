import NextAuth, { type DefaultSession } from "next-auth";
import { type JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    isSubscribed: boolean;
    subscriptionExpiresAt: Date | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const passwordMatch = await bcrypt.compare(credentials.password as string, user.password);
        if (!passwordMatch) {
          return null;
        }

        if (!user.isActive) {
          throw new Error("Compte non activé. Veuillez valider votre email.");
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          isSubscribed: user.isSubscribed,
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
      }
      return token;
    },
    async session({ session, token }) {
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
