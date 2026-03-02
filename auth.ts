import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs"; // Importez bcryptjs

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

        // Vérifier le mot de passe
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
        token.role = (user as any).role;
        token.id = user.id;
        token.isSubscribed = (user as any).isSubscribed;
        token.subscriptionExpiresAt = (user as any).subscriptionExpiresAt;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).isSubscribed = token.isSubscribed;
        (session.user as any).subscriptionExpiresAt = token.subscriptionExpiresAt;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
