import { auth } from "./auth";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const getSecretKey = () => {
    const secret = process.env.AUTH_SECRET || "fallback_secret_for_dev_only";
    return new TextEncoder().encode(secret);
};

export default auth(async (req) => {
  const isAuth = !!req.auth;
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");
  
  // 1. On laisse passer TOUTES les APIs. Elles gèrent leur propre sécurité.
  // Cela évite les erreurs 401 dues aux problèmes de cookies sur certains appareils.
  if (isApiRoute) {
    return NextResponse.next();
  }

  // 2. Pour les pages Web, on vérifie l'auth
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/register");
  if (isAuthPage) return NextResponse.next();

  if (!isAuth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|logo.svg|public|uploads).*)",
  ],
};
