import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Même clé que dans l'API Login
const getSecretKey = () => {
    const secret = process.env.AUTH_SECRET || "fallback_secret_for_dev_only";
    return new TextEncoder().encode(secret);
};

export default auth(async (req) => {
  const isAuth = !!req.auth; // Session Web (Cookie)
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/register");
  const isPublicApi = 
    req.nextUrl.pathname.startsWith("/api/auth") || 
    req.nextUrl.pathname.startsWith("/api/payment/genius/callback");

  // 1. Autoriser les routes publiques
  if (isAuthRoute || isPublicApi) {
    return NextResponse.next();
  }

  // 2. Vérification de l'authentification (Web OU Mobile)
  let isAuthenticated = isAuth;

  // Si pas de session web, on vérifie si c'est un appel mobile avec un Token Bearer
  if (!isAuthenticated && isApiRoute) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        // On vérifie la validité du JWT mobile
        await jwtVerify(token, getSecretKey());
        isAuthenticated = true;
      } catch (e) {
        console.error("Token mobile invalide:", e);
      }
    }
  }

  // 3. Blocage si non authentifié
  if (isApiRoute && !isAuthenticated) {
    return NextResponse.json({ error: "Non autorisé. Veuillez vous connecter." }, { status: 401 });
  }

  if (!isAuthenticated && !isApiRoute) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/payment/genius/callback|_next/static|_next/image|favicon.ico|logo.svg|public|uploads).*)",
  ],
};
