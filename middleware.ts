import { auth } from "./auth";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Même clé que dans l'API Login
const getSecretKey = () => {
    const secret = process.env.AUTH_SECRET || "fallback_secret_for_dev_only";
    return new TextEncoder().encode(secret);
};

export default auth(async (req) => {
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/register");
  
  // Routes publiques (Auth, Callbacks, etc.)
  const isPublicApi = 
    req.nextUrl.pathname.startsWith("/api/auth") || 
    req.nextUrl.pathname.startsWith("/api/payment/genius/callback");

  if (isAuthPage || isPublicApi) {
    return NextResponse.next();
  }

  // --- IDENTIFICATION ROBUSTE (Web + Mobile) ---
  let userEmail = req.auth?.user?.email;

  // Si pas de session Web, on vérifie si c'est un appel Mobile avec Token Bearer
  if (!userEmail && isApiRoute) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const { payload } = await jwtVerify(token, getSecretKey());
        userEmail = payload.email as string;
      } catch (e) {
        console.error("Middleware: Token Mobile invalide");
      }
    }
  }

  // --- PROTECTION & INJECTION ---
  if (isApiRoute) {
    // Si on a identifié l'utilisateur, on injecte son email dans un header
    // que l'API pourra lire de manière fiable.
    const response = NextResponse.next();
    if (userEmail) {
      response.headers.set("x-user-email", userEmail);
    } else if (!isPublicApi) {
      // Si aucune identification pour une API privée, on bloque
      return NextResponse.json({ error: "Identification requise" }, { status: 401 });
    }
    return response;
  }

  // Protection des pages Web classiques
  if (!userEmail && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.svg|public|uploads).*)",
  ],
};
