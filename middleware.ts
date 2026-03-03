import { auth } from "./auth";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const getSecretKey = () => {
    const secret = process.env.AUTH_SECRET || "fallback_secret_for_dev_only";
    return new TextEncoder().encode(secret);
};

export default auth(async (req) => {
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/register");
  
  const isPublicApi = 
    req.nextUrl.pathname.startsWith("/api/auth") || 
    req.nextUrl.pathname.startsWith("/api/payment/genius/callback");

  if (isAuthPage || isPublicApi) {
    return NextResponse.next();
  }

  // --- IDENTIFICATION ---
  let userEmail = req.auth?.user?.email;

  // Identification Mobile
  if (!userEmail && isApiRoute) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const { payload } = await jwtVerify(token, getSecretKey());
        userEmail = payload.email as string;
      } catch (e) {}
    }
  }

  // --- LOGIQUE DE PASSAGE ---
  if (isApiRoute) {
    const response = NextResponse.next();
    if (userEmail) {
      response.headers.set("x-user-email", userEmail);
    }
    // On ne retourne PLUS de 401 ici. On laisse l'API décider.
    // Cela règle le problème des sessions instables sur iPhone.
    return response;
  }

  // Protection des pages Web (uniquement pour les pages, pas les APIs)
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
